declare interface Artifacts {
  create(
    name: string,
    opts?: {
      readOnly?: boolean;
      description?: string;
      setDefaultBranch?: string;
    },
  ): Promise<ArtifactsCreateRepoResult & { repo: ArtifactsRepo }>;
  get(name: string): Promise<ArtifactsRepo | null>;
}

declare interface ArtifactsCreateRepoResult {
  name: string;
  remote: string;
  token: string;
  defaultBranch: string;
}

declare interface ArtifactsRepo {
  info(): Promise<ArtifactsRepoInfo | null>;
  createToken(scope?: "read" | "write", ttl?: number): Promise<ArtifactsCreateTokenResult>;
}

declare interface ArtifactsRepoInfo {
  remote: string;
  defaultBranch: string;
}

declare interface ArtifactsCreateTokenResult {
  plaintext: string;
  scope: "read" | "write";
  expiresAt: string;
}

declare interface SendEmail {
  send(message: {
    to: string | string[];
    from: string;
    subject: string;
    text?: string;
    html?: string;
    headers?: Record<string, string>;
  }): Promise<void>;
}

declare interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  run(): Promise<unknown>;
}

declare interface D1Database {
  prepare(query: string): D1PreparedStatement;
  exec(query: string): Promise<unknown>;
}

declare interface ForwardableEmailMessage {
  readonly from: string;
  readonly to: string;
  readonly headers: Headers;
  readonly raw: ReadableStream;
  readonly rawSize: number;
  readonly canBeForwarded: boolean;

  setReject(reason: string): void;
  forward(rcptTo: string, headers?: Headers): Promise<void>;
  reply(message: unknown): Promise<void>;
}

declare interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
}

declare interface ExportedHandler<TEnv = unknown> {
  fetch?(request: Request, env: TEnv, ctx: ExecutionContext): Promise<Response> | Response;
  email?(message: ForwardableEmailMessage, env: TEnv, ctx: ExecutionContext): Promise<void> | void;
}

declare module "cloudflare:workers" {
  export const env: import("./src/lib/types").WorkerEnv;
}
