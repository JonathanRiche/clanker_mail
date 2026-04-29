import type {
  ArchivedMessageDetail,
  ArchivedMessageListItem,
  WorkerEnv,
} from "../types";

const CONFIG_KEY = "app";

const SCHEMA_STATEMENTS = [
  `
    CREATE TABLE IF NOT EXISTS worker_config (
      config_key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `,
  `
    CREATE TABLE IF NOT EXISTS email_messages (
      id TEXT PRIMARY KEY,
      archive_group TEXT NOT NULL,
      entry_path TEXT NOT NULL,
      archived_at TEXT NOT NULL,
      message_id TEXT NOT NULL,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      raw_size INTEGER NOT NULL,
      raw_eml TEXT NOT NULL,
      headers_json TEXT NOT NULL,
      metadata_json TEXT NOT NULL,
      summary_md TEXT NOT NULL
    )
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_email_messages_archive_group
      ON email_messages (archive_group, archived_at DESC)
  `,
  `
    CREATE INDEX IF NOT EXISTS idx_email_messages_recipient
      ON email_messages (recipient, archived_at DESC)
  `,
] as const;

let schema_ready: Promise<void> | null = null;

export async function readConfigDocument(env: WorkerEnv): Promise<unknown | null> {
  await ensureSchema(env);

  const row = await env.DB
    .prepare("SELECT value_json FROM worker_config WHERE config_key = ?1")
    .bind(CONFIG_KEY)
    .first<{ value_json: string }>();

  if (!row) {
    return null;
  }

  return JSON.parse(row.value_json);
}

export async function writeConfigDocument(env: WorkerEnv, value: unknown): Promise<void> {
  await ensureSchema(env);

  const timestamp = new Date().toISOString();
  await env.DB
    .prepare(`
      INSERT INTO worker_config (config_key, value_json, updated_at)
      VALUES (?1, ?2, ?3)
      ON CONFLICT(config_key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `)
    .bind(CONFIG_KEY, JSON.stringify(value), timestamp)
    .run();
}

export async function writeArchivedMessage(
  env: WorkerEnv,
  message: {
    id: string;
    archiveGroup: string;
    entryPath: string;
    archivedAt: string;
    messageId: string;
    sender: string;
    recipient: string;
    subject: string;
    rawSize: number;
    rawEml: string;
    headersJson: string;
    metadataJson: string;
    summaryMd: string;
  },
): Promise<void> {
  await ensureSchema(env);

  await env.DB
    .prepare(`
      INSERT OR REPLACE INTO email_messages (
        id,
        archive_group,
        entry_path,
        archived_at,
        message_id,
        sender,
        recipient,
        subject,
        raw_size,
        raw_eml,
        headers_json,
        metadata_json,
        summary_md
      ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
    `)
    .bind(
      message.id,
      message.archiveGroup,
      message.entryPath,
      message.archivedAt,
      message.messageId,
      message.sender,
      message.recipient,
      message.subject,
      message.rawSize,
      message.rawEml,
      message.headersJson,
      message.metadataJson,
      message.summaryMd,
    )
    .run();
}

export async function listArchivedMessages(
  env: WorkerEnv,
  limit: number,
): Promise<ArchivedMessageListItem[]> {
  await ensureSchema(env);

  const result = await env.DB
    .prepare(`
      SELECT
        id,
        archive_group,
        entry_path,
        archived_at,
        message_id,
        sender,
        recipient,
        subject,
        raw_size
      FROM email_messages
      ORDER BY archived_at DESC
      LIMIT ?1
    `)
    .bind(limit)
    .all<ArchivedMessageListRow>();

  return (result.results ?? []).map(toArchivedMessageListItem);
}

export async function getArchivedMessage(
  env: WorkerEnv,
  id: string,
): Promise<ArchivedMessageDetail | null> {
  await ensureSchema(env);

  const row = await env.DB
    .prepare(`
      SELECT
        id,
        archive_group,
        entry_path,
        archived_at,
        message_id,
        sender,
        recipient,
        subject,
        raw_size,
        raw_eml,
        headers_json,
        metadata_json,
        summary_md
      FROM email_messages
      WHERE id = ?1
    `)
    .bind(id)
    .first<ArchivedMessageDetailRow>();

  if (!row) {
    return null;
  }

  return {
    ...toArchivedMessageListItem(row),
    rawEml: row.raw_eml,
    headers: parseHeaders(row.headers_json),
    metadata: parseMetadata(row.metadata_json),
    summaryMd: row.summary_md,
    participants: {
      from: [],
      replyTo: [],
      to: [],
      cc: [],
    },
    thread: {
      replySubject: row.subject,
      inReplyTo: "",
      references: [],
    },
  };
}

async function ensureSchema(env: WorkerEnv): Promise<void> {
  if (!schema_ready) {
    schema_ready = initializeSchema(env)
      .catch((error: unknown) => {
        schema_ready = null;
        throw error;
      });
  }

  await schema_ready;
}

async function initializeSchema(env: WorkerEnv): Promise<void> {
  for (const statement of SCHEMA_STATEMENTS) {
    await env.DB.prepare(statement.trim()).run();
  }
}

interface ArchivedMessageListRow {
  id: string;
  archive_group: string;
  entry_path: string;
  archived_at: string;
  message_id: string;
  sender: string;
  recipient: string;
  subject: string;
  raw_size: number;
}

interface ArchivedMessageDetailRow extends ArchivedMessageListRow {
  raw_eml: string;
  headers_json: string;
  metadata_json: string;
  summary_md: string;
}

function toArchivedMessageListItem(row: ArchivedMessageListRow): ArchivedMessageListItem {
  return {
    id: row.id,
    archiveGroup: row.archive_group,
    entryPath: row.entry_path,
    archivedAt: row.archived_at,
    messageId: row.message_id,
    sender: row.sender,
    recipient: row.recipient,
    subject: row.subject,
    rawSize: row.raw_size,
  };
}

function parseHeaders(value: string): Record<string, string> {
  const parsed = JSON.parse(value);
  return isStringRecord(parsed) ? parsed : {};
}

function parseMetadata(value: string): Record<string, unknown> {
  const parsed = JSON.parse(value);
  return isRecord(parsed) ? parsed : {};
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry == "string");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value == "object" && value !== null;
}
