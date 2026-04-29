export type ArchiveStrategy = "monthly-mailbox";

export interface AutoReplyConfig {
  enabled: boolean;
  from: string;
  subjectPrefix: string;
  text: string;
  html: string;
}

export interface ArchivedMessageListItem {
  id: string;
  archiveGroup: string;
  entryPath: string;
  archivedAt: string;
  messageId: string;
  sender: string;
  recipient: string;
  subject: string;
  rawSize: number;
}

export interface ArchivedMessageParticipants {
  from: string[];
  replyTo: string[];
  to: string[];
  cc: string[];
}

export interface ArchivedMessageThreadContext {
  replySubject: string;
  inReplyTo: string;
  references: string[];
}

export interface ArchivedMessageDetail extends ArchivedMessageListItem {
  rawEml: string;
  headers: Record<string, string>;
  metadata: Record<string, unknown>;
  summaryMd: string;
  participants: ArchivedMessageParticipants;
  thread: ArchivedMessageThreadContext;
}

export interface AppConfig {
  controlRepo: string;
  archiveRepoPrefix: string;
  archiveStrategy: ArchiveStrategy;
  journalAddress: string;
  forwardTo: string[];
  autoReply: AutoReplyConfig;
}

export interface DashboardModel {
  config: AppConfig;
  configRepoExists: boolean;
  archivePreviewRepo: string;
  saveState: "idle" | "saved" | "error";
  errorMessage?: string;
}

export interface WorkerEnv {
  DB: D1Database;
  ARTIFACTS?: Artifacts;
  EMAIL: SendEmail;
  CM_READ_API_TOKEN?: string;
  CM_DEFAULT_FORWARD_TO: string;
  CM_DEFAULT_JOURNAL_ADDRESS: string;
  CM_DEFAULT_CONTROL_REPO: string;
  CM_DEFAULT_ARCHIVE_REPO_PREFIX: string;
  CM_DEFAULT_AUTOREPLY_FROM: string;
  CM_DEFAULT_AUTOREPLY_SUBJECT_PREFIX: string;
  CM_DEFAULT_AUTOREPLY_TEXT: string;
  CM_DEFAULT_AUTOREPLY_HTML: string;
}
