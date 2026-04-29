import { env as runtimeEnv } from "cloudflare:workers";
import { route, render } from "rwsdk/router";
import { defineApp } from "rwsdk/worker";

import { DashboardPage } from "./app/pages/dashboard";
import { Document } from "./app/document";
import { loadConfig, configFromFormData, saveConfig } from "./lib/config";
import { archiveMessage, maybeAutoReply, maybeForwardMessage, repoNameForMessage } from "./lib/email";
import { getArchivedMessage, listArchivedMessages } from "./lib/storage";
import type { DashboardModel, WorkerEnv } from "./lib/types";

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
  return Response.json({ message }, noStoreInit());
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
