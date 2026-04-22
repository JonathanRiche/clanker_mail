export type ArchiveStrategy = "monthly-mailbox";

export interface AutoReplyConfig {
  enabled: boolean;
  from: string;
  subjectPrefix: string;
  text: string;
  html: string;
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
  ARTIFACTS: Artifacts;
  EMAIL: SendEmail;
  CM_DEFAULT_FORWARD_TO: string;
  CM_DEFAULT_JOURNAL_ADDRESS: string;
  CM_DEFAULT_CONTROL_REPO: string;
  CM_DEFAULT_ARCHIVE_REPO_PREFIX: string;
  CM_DEFAULT_AUTOREPLY_FROM: string;
  CM_DEFAULT_AUTOREPLY_SUBJECT_PREFIX: string;
  CM_DEFAULT_AUTOREPLY_TEXT: string;
  CM_DEFAULT_AUTOREPLY_HTML: string;
}
