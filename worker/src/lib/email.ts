import type { AppConfig, WorkerEnv } from "./types";
import { writeFilesToRepo } from "./artifacts";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export async function archiveMessage(
  env: WorkerEnv,
  config: AppConfig,
  message: ForwardableEmailMessage,
): Promise<{ repoName: string; entryPath: string }> {
  const rawBytes = await streamToUint8Array(message.raw);
  const rawText = decoder.decode(rawBytes);
  const timestamp = new Date().toISOString();
  const archiveRepo = repoNameForMessage(config, message.to, timestamp);
  const messageId = message.headers.get("message-id") ?? `${timestamp}-${crypto.randomUUID()}`;
  const entryPath = archiveEntryPath(timestamp, messageId);

  const headersObject = Object.fromEntries(message.headers.entries());
  const metadata = {
    archivedAt: timestamp,
    canBeForwarded: message.canBeForwarded,
    from: message.from,
    to: message.to,
    rawSize: message.rawSize,
    subject: message.headers.get("subject") ?? "",
    messageId,
  };

  await writeFilesToRepo(
    env,
    archiveRepo,
    [
      {
        path: `${entryPath}/raw.eml`,
        contents: rawText,
      },
      {
        path: `${entryPath}/headers.json`,
        contents: JSON.stringify(headersObject, null, 2) + "\n",
      },
      {
        path: `${entryPath}/metadata.json`,
        contents: JSON.stringify(metadata, null, 2) + "\n",
      },
      {
        path: `${entryPath}/summary.md`,
        contents: buildSummaryMarkdown(metadata, headersObject),
      },
    ],
    `Archive inbound email ${messageId}`,
  );

  return {
    repoName: archiveRepo,
    entryPath,
  };
}

export async function maybeForwardMessage(
  config: AppConfig,
  message: ForwardableEmailMessage,
): Promise<void> {
  if (!message.canBeForwarded || config.forwardTo.length == 0) {
    return;
  }

  for (const destination of config.forwardTo) {
    await message.forward(destination, forwardHeaders(message.to));
  }
}

export async function maybeAutoReply(
  env: WorkerEnv,
  config: AppConfig,
  message: ForwardableEmailMessage,
): Promise<void> {
  if (!config.autoReply.enabled || config.autoReply.from.length == 0) {
    return;
  }

  const subject = message.headers.get("subject") ?? "Message received";
  const replySubject = `${config.autoReply.subjectPrefix} ${subject}`.trim();

  await env.EMAIL.send({
    to: message.from,
    from: config.autoReply.from,
    subject: replySubject,
    text: config.autoReply.text,
    html: config.autoReply.html,
    headers: {
      "X-Clanker-Mail-AutoReply": "true",
      "In-Reply-To": message.headers.get("message-id") ?? "",
    },
  });
}

export function repoNameForMessage(config: AppConfig, recipient: string, isoDate: string): string {
  const date = new Date(isoDate);
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const mailbox = slugMailbox(recipient);
  return `${config.archiveRepoPrefix}-${mailbox}-${year}-${month}`;
}

function archiveEntryPath(isoDate: string, messageId: string): string {
  const date = new Date(isoDate);
  const year = `${date.getUTCFullYear()}`;
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const time = `${date.getUTCHours()}`.padStart(2, "0") +
    `${date.getUTCMinutes()}`.padStart(2, "0") +
    `${date.getUTCSeconds()}`.padStart(2, "0");
  return `messages/${year}/${month}/${day}/${time}-${slugMessageId(messageId)}`;
}

function buildSummaryMarkdown(
  metadata: Record<string, unknown>,
  headers: Record<string, string>,
): string {
  const lines = [
    "# Archived Email",
    "",
    `- From: ${String(metadata.from ?? "")}`,
    `- To: ${String(metadata.to ?? "")}`,
    `- Subject: ${String(metadata.subject ?? "")}`,
    `- Message-ID: ${String(metadata.messageId ?? "")}`,
    `- Archived At: ${String(metadata.archivedAt ?? "")}`,
    "",
    "## Header Snapshot",
    "",
  ];

  for (const [key, value] of Object.entries(headers)) {
    lines.push(`- ${key}: ${value}`);
  }

  lines.push("");
  return lines.join("\n");
}

function forwardHeaders(originalRecipient: string): Headers {
  const headers = new Headers();
  headers.set("X-Clanker-Mail-Routed-To", originalRecipient);
  headers.set("X-Clanker-Mail-Forwarded-At", new Date().toISOString());
  return headers;
}

function slugMailbox(address: string): string {
  return address
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function slugMessageId(messageId: string): string {
  return messageId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

async function streamToUint8Array(stream: ReadableStream): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const next = await reader.read();
      if (next.done) {
        break;
      }
      const value = next.value instanceof Uint8Array ? next.value : encoder.encode(String(next.value));
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }

  const buffer = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return buffer;
}
