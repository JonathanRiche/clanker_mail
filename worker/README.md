# clanker_mail Worker

This directory scaffolds the agent-driven side of `clanker_mail`:

- inbound email handling with Cloudflare Email Routing
- versioned mailbox storage in Cloudflare Artifacts
- an RWSDK control UI for editing the routing profile
- optional forwarding and auto-replies from the Worker

The design assumes:

- agents are the main readers and writers
- mailbox state should be a versioned file tree
- Artifacts is the primary store
- the Zig CLI continues to handle outbound REST API sending

## Architecture

The Worker has two entrypoints in one deployment:

- `fetch`: RWSDK UI and JSON config endpoints
- `email`: Email Routing handler for inbound mail

Configuration is stored in an Artifacts control repo:

```text
config/app.json
```

Archived messages are stored in mailbox-sharded monthly repos:

```text
<archive-prefix>-<mailbox>-YYYY-MM
```

Inside each archive repo, each message is written as:

```text
messages/YYYY/MM/DD/HHMMSS-message-id/raw.eml
messages/YYYY/MM/DD/HHMMSS-message-id/headers.json
messages/YYYY/MM/DD/HHMMSS-message-id/metadata.json
messages/YYYY/MM/DD/HHMMSS-message-id/summary.md
```

That gives agents:

- full raw MIME
- structured metadata
- a simple summary file
- Git history, diffs, and forks

## Why Artifacts first

This scaffold treats email as a versioned workspace, not a SQL-first dataset.

Artifacts is a better fit here when you want:

- version-controlled mailbox trees
- Git-native agent workflows
- mounted filesystems via ArtifactFS
- repo-per-mailbox or repo-per-session isolation
- commit history for mail processing

If you later need fast search or dashboard-style filtering, add D1 as a secondary index instead of making it the primary source of truth.

## Local project layout

```text
worker/
  package.json
  tsconfig.json
  vite.config.mts
  wrangler.jsonc
  src/
    app/
      document.tsx
      pages/
        dashboard.tsx
    lib/
      artifacts.ts
      config.ts
      email.ts
      types.ts
    worker.tsx
```

## Setup

### 1. Install dependencies

```bash
cd worker
npm install
```

### 2. Typecheck and build

```bash
npm run typecheck
npm run build
```

This repository ships with a small local bindings shim so an agent can typecheck and build immediately after
`npm install`.

### 3. Refresh generated Wrangler types when you want exact binding output

```bash
npx wrangler types
```

Wrangler writes `worker-configuration.d.ts`, which is ignored in git. Use that command when you want the local
types regenerated from your real Wrangler config and account state.

If you are running inside a constrained agent environment with a read-only home directory, set a writable config
path before Wrangler commands:

```bash
XDG_CONFIG_HOME=/tmp npx wrangler types
```

### 4. Configure Wrangler bindings

The scaffold already includes placeholders in `wrangler.jsonc` for:

- `artifacts`
- `send_email`

You still need to:

- create or choose an Artifacts namespace
- enable Email Routing
- enable Email Sending if you want auto-replies
- route a journal mailbox to this Worker in the Cloudflare dashboard

The inbound email route is configured in Cloudflare Email Routing, not as a top-level `email` field in
`wrangler.jsonc`.

### 5. Run the UI locally

```bash
npm run dev
```

## Recommended flow

### Inbound mail

1. Cloudflare routes `journal@yourdomain.com` to the Worker.
2. The `email()` handler reads the message metadata and raw MIME.
3. The Worker archives the message into an Artifacts repo.
4. The Worker optionally forwards the message and/or sends an auto-reply.

### Outbound mail

1. `cm` sends mail through the Email Service REST API.
2. `cm` BCCs the journal mailbox.
3. The journal copy comes back through Email Routing.
4. The Worker archives it in Artifacts.

That gives you a sent-mail trail without relying on a sent-mail REST endpoint.

## Notes

- This scaffold uses `isomorphic-git` plus an in-memory filesystem to commit to Artifacts from Worker code.
- The UI lives at `/`, and `/config` exposes the current routing profile as JSON for agent tooling.
- The code is intended as a starting point; you will likely refine repo sharding, commit batching, and parsing once you know your real mail volume.
- For higher volume setups, prefer multiple archive repos instead of one giant shared repo.
- If you need query-heavy analytics later, use Cloudflare GraphQL email analytics and optionally add a D1 index.
