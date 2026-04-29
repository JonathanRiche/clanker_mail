import { env as runtimeEnv } from "cloudflare:workers";
import { route, render } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { DashboardPage } from "./app/pages/dashboard";
import { Document } from "./app/document";
import { loadConfig, configFromFormData, saveConfig } from "./lib/config";
import { archiveMessage, maybeAutoReply, maybeForwardMessage, repoNameForMessage } from "./lib/email";
import { getArchivedMessage, listArchivedMessages } from "./lib/storage";
import type {
  ArchivedMessageDetail,
  ArchivedMessageParticipants,
  ArchivedMessageThreadContext,
  DashboardModel,
  WorkerEnv,
} from "./lib/types";

const workerEnv = runtimeEnv as WorkerEnv;

const app = defineApp([
  render(Document, [
    route("/", async ({ request }) => {
      const { config, repoExists } = await loadConfig(workerEnv);
      return <DashboardPage model={dashboardModel(request, config, repoExists)} />;
    }),
    route("/config", {
      get: async () => {
        const { config, repoExists } = await loadConfig(workerEnv);
        return Response.json({
          config,
          configRepoExists: repoExists,
          archivePreviewRepo: repoNameForMessage(config, config.journalAddress, new Date().toISOString()),
        });
      },
      post: async ({ request }) => {
        const formData = await request.formData();
        const config = await configFromFormData(workerEnv, formData);
        await saveConfig(workerEnv, config);

        const url = new URL(request.url);
        url.pathname = "/";
        url.searchParams.set("saved", "1");
        return Response.redirect(url.toString(), 303);
      },
    }),
  ]),
]);

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    const apiResponse = await handleReadApiRequest(request, env);
    if (apiResponse) {
      return apiResponse;
    }
    return app.fetch(request, env as unknown as Parameters<typeof app.fetch>[1], ctx);
  },
  async email(message: ForwardableEmailMessage, env: WorkerEnv, ctx: ExecutionContext): Promise<void> {
    const { config } = await loadConfig(env);

    const archive = await archiveMessage(env, config, message);

    ctx.waitUntil(Promise.resolve(console.log("archived", archive.repoName, archive.entryPath)));

    await maybeForwardMessage(config, message);
    await maybeAutoReply(env, config, message);
  },
} satisfies ExportedHandler<WorkerEnv>;

async function handleReadApiRequest(request: Request, env: WorkerEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/messages")) {
    return null;
  }

  const authError = authenticateReadApiRequest(request, env);
  if (authError) {
    return authError;
  }

  if (request.method != "GET") {
    return jsonError("method not allowed", 405);
  }

  if (url.pathname == "/api/messages") {
    const limit = clampLimit(url.searchParams.get("limit"));
    const messages = await listArchivedMessages(env, limit);
    return Response.json({ messages }, noStoreInit());
  }

  const prefix = "/api/messages/";
  if (!url.pathname.startsWith(prefix) || url.pathname.length <= prefix.length) {
    return jsonError("not found", 404);
  }

  const messageId = decodeURIComponent(url.pathname.slice(prefix.length));
  const message = await getArchivedMessage(env, messageId);
  if (!message) {
    return jsonError("message not found", 404);
  }
  return Response.json({ message: withReplyContext(message) }, noStoreInit());
}

function dashboardModel(
  request: Request,
  config: DashboardModel["config"],
  repoExists: boolean,
): DashboardModel {
  const url = new URL(request.url);
  const saveState = url.searchParams.get("saved") == "1" ? "saved" : "idle";

  return {
    config,
    configRepoExists: repoExists,
    archivePreviewRepo: repoNameForMessage(config, config.journalAddress, new Date().toISOString()),
    saveState,
  };
}

function authenticateReadApiRequest(request: Request, env: WorkerEnv): Response | null {
  const configuredToken = env.CM_READ_API_TOKEN?.trim() ?? "";
  if (configuredToken.length == 0) {
    return jsonError("read API is not configured", 503);
  }

  const header = request.headers.get("authorization");
  if (!header || !header.startsWith("Bearer ")) {
    return unauthorizedResponse();
  }

  const presentedToken = header.slice("Bearer ".length).trim();
  return presentedToken == configuredToken ? null : unauthorizedResponse();
}

function clampLimit(limitValue: string | null): number {
  const parsed = Number.parseInt(limitValue ?? "20", 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 20;
  }
  return Math.min(parsed, 100);
}

function noStoreInit(init: ResponseInit = {}): ResponseInit {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "no-store");
  return {
    ...init,
    headers,
  };
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, noStoreInit({ status }));
}

function unauthorizedResponse(): Response {
  const response = jsonError("unauthorized", 401);
  response.headers.set("WWW-Authenticate", 'Bearer realm="clanker_mail"');
  return response;
}

function withReplyContext(message: ArchivedMessageDetail): ArchivedMessageDetail {
  return {
    ...message,
    participants: archivedMessageParticipants(message),
    thread: archivedMessageThread(message),
  };
}

function archivedMessageParticipants(message: ArchivedMessageDetail): ArchivedMessageParticipants {
  return {
    from: parseAddressList(headerValue(message.headers, "from") ?? message.sender),
    replyTo: parseAddressList(headerValue(message.headers, "reply-to") ?? ""),
    to: parseAddressList(headerValue(message.headers, "to") ?? ""),
    cc: parseAddressList(headerValue(message.headers, "cc") ?? ""),
  };
}

function archivedMessageThread(message: ArchivedMessageDetail): ArchivedMessageThreadContext {
  const messageId = (headerValue(message.headers, "message-id") ?? message.messageId).trim();
  const references = parseMessageIdList(headerValue(message.headers, "references") ?? "");
  const inReplyTo = parseMessageIdList(headerValue(message.headers, "in-reply-to") ?? "");
  const threadReferences = uniqueValues([...references, ...inReplyTo, messageId].filter(Boolean));

  return {
    replySubject: replySubjectFor(message.subject),
    inReplyTo: messageId,
    references: threadReferences,
  };
}

function replySubjectFor(subject: string): string {
  const trimmed = subject.trim();
  if (trimmed.length == 0) {
    return "Re:";
  }
  return /^\s*re\s*:/i.test(trimmed) ? trimmed : `Re: ${trimmed}`;
}

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const needle = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() == needle) {
      return value;
    }
  }
  return undefined;
}

function parseAddressList(value: string): string[] {
  const addresses: string[] = [];
  for (const entry of splitHeaderList(value)) {
    const address = extractAddress(entry);
    if (!address) {
      continue;
    }
    const normalized = address.toLowerCase();
    if (!addresses.includes(normalized)) {
      addresses.push(normalized);
    }
  }
  return addresses;
}

function splitHeaderList(value: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let inQuote = false;
  let angleDepth = 0;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char == "\\" && inQuote) {
      escaped = true;
      continue;
    }
    if (char == "\"") {
      inQuote = !inQuote;
      continue;
    }
    if (!inQuote) {
      if (char == "<") {
        angleDepth += 1;
        continue;
      }
      if (char == ">" && angleDepth > 0) {
        angleDepth -= 1;
        continue;
      }
      if (char == "," && angleDepth == 0) {
        parts.push(value.slice(start, index).trim());
        start = index + 1;
      }
    }
  }

  parts.push(value.slice(start).trim());
  return parts.filter((part) => part.length > 0);
}

function extractAddress(value: string): string | null {
  const angleMatch = value.match(/<([^<>\s]+@[^<>\s]+)>/i);
  if (angleMatch) {
    return angleMatch[1];
  }

  const bareMatch = value.match(/[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}/i);
  return bareMatch ? bareMatch[0] : null;
}

function parseMessageIdList(value: string): string[] {
  const matches = value.match(/<[^<>]+>/g);
  if (!matches) {
    const trimmed = value.trim();
    return trimmed.length == 0 ? [] : [trimmed];
  }
  return uniqueValues(matches.map((match) => match.trim()).filter(Boolean));
}

function uniqueValues(values: string[]): string[] {
  const unique: string[] = [];
  for (const value of values) {
    if (!unique.includes(value)) {
      unique.push(value);
    }
  }
  return unique;
}
