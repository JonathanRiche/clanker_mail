import type { AppConfig, WorkerEnv } from "./types";
import { readJsonFileFromRepo, writeJsonFileToRepo } from "./artifacts";

export const CONTROL_REPO_CONFIG_PATH = "config/app.json";

export function defaultConfig(env: WorkerEnv): AppConfig {
  return {
    controlRepo: env.CM_DEFAULT_CONTROL_REPO || "cm-control",
    archiveRepoPrefix: env.CM_DEFAULT_ARCHIVE_REPO_PREFIX || "cm-mail",
    archiveStrategy: "monthly-mailbox",
    journalAddress: env.CM_DEFAULT_JOURNAL_ADDRESS || "journal@example.com",
    forwardTo: splitCsv(env.CM_DEFAULT_FORWARD_TO),
    autoReply: {
      enabled: false,
      from: env.CM_DEFAULT_AUTOREPLY_FROM || "",
      subjectPrefix: env.CM_DEFAULT_AUTOREPLY_SUBJECT_PREFIX || "Re:",
      text: env.CM_DEFAULT_AUTOREPLY_TEXT || "Your message was received.",
      html: env.CM_DEFAULT_AUTOREPLY_HTML || "<p>Your message was received.</p>",
    },
  };
}

export async function loadConfig(
  env: WorkerEnv,
): Promise<{ config: AppConfig; repoExists: boolean }> {
  const fallback = defaultConfig(env);
  const json = await readJsonFileFromRepo(env, fallback.controlRepo, CONTROL_REPO_CONFIG_PATH);
  if (!json) {
    return {
      config: fallback,
      repoExists: false,
    };
  }

  return {
    config: normalizeConfig(json, fallback),
    repoExists: true,
  };
}

export async function saveConfig(env: WorkerEnv, config: AppConfig): Promise<void> {
  const normalized = normalizeConfig(config, defaultConfig(env));
  await writeJsonFileToRepo(
    env,
    normalized.controlRepo,
    CONTROL_REPO_CONFIG_PATH,
    normalized,
    "Update clanker_mail worker configuration",
  );
}

export async function configFromFormData(
  env: WorkerEnv,
  formData: FormData,
): Promise<AppConfig> {
  const fallback = defaultConfig(env);

  return normalizeConfig(
    {
      controlRepo: stringValue(formData, "controlRepo", fallback.controlRepo),
      archiveRepoPrefix: stringValue(formData, "archiveRepoPrefix", fallback.archiveRepoPrefix),
      archiveStrategy: "monthly-mailbox",
      journalAddress: stringValue(formData, "journalAddress", fallback.journalAddress),
      forwardTo: splitCsv(stringValue(formData, "forwardTo", "")),
      autoReply: {
        enabled: formData.get("autoReplyEnabled") == "on",
        from: stringValue(formData, "autoReplyFrom", fallback.autoReply.from),
        subjectPrefix: stringValue(
          formData,
          "autoReplySubjectPrefix",
          fallback.autoReply.subjectPrefix,
        ),
        text: stringValue(formData, "autoReplyText", fallback.autoReply.text),
        html: stringValue(formData, "autoReplyHtml", fallback.autoReply.html),
      },
    },
    fallback,
  );
}

export function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length != 0);
}

function stringValue(formData: FormData, key: string, fallback: string): string {
  const value = formData.get(key);
  if (typeof value != "string") {
    return fallback;
  }
  return value.trim();
}

function normalizeConfig(value: unknown, fallback: AppConfig): AppConfig {
  const input = isRecord(value) ? value : {};
  const autoReplyInput = isRecord(input.autoReply) ? input.autoReply : {};

  return {
    controlRepo: sanitizeRepoName(stringOr(input.controlRepo, fallback.controlRepo), fallback.controlRepo),
    archiveRepoPrefix: sanitizeRepoName(
      stringOr(input.archiveRepoPrefix, fallback.archiveRepoPrefix),
      fallback.archiveRepoPrefix,
    ),
    archiveStrategy: "monthly-mailbox",
    journalAddress: stringOr(input.journalAddress, fallback.journalAddress),
    forwardTo: Array.isArray(input.forwardTo)
      ? input.forwardTo.filter((entry): entry is string => typeof entry == "string" && entry.trim().length != 0)
      : fallback.forwardTo,
    autoReply: {
      enabled: booleanOr(autoReplyInput.enabled, fallback.autoReply.enabled),
      from: stringOr(autoReplyInput.from, fallback.autoReply.from),
      subjectPrefix: stringOr(autoReplyInput.subjectPrefix, fallback.autoReply.subjectPrefix),
      text: stringOr(autoReplyInput.text, fallback.autoReply.text),
      html: stringOr(autoReplyInput.html, fallback.autoReply.html),
    },
  };
}

function sanitizeRepoName(value: string, fallback: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return cleaned.length == 0 ? fallback : cleaned;
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value == "string" ? value : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value == "boolean" ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value == "object" && value !== null;
}
