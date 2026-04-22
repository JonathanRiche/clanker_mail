# clanker_mail Worker

This directory scaffolds the agent-driven side of `clanker_mail`:

- inbound email handling with Cloudflare Email Routing
- D1-backed mailbox storage
- an RWSDK control UI for editing the routing profile
- optional forwarding and auto-replies from the Worker

The design assumes:

- agents are the main readers and writers
- D1 is the temporary store until Cloudflare Artifacts public beta access is available
- the Zig CLI continues to handle outbound REST API sending

## Architecture

The Worker has two entrypoints in one deployment:

- `fetch`: RWSDK UI and JSON config endpoints
- `email`: Email Routing handler for inbound mail

Configuration is stored in D1:

```text
worker_config(config_key='app')
```

Archived messages are stored in D1 rows grouped by the same mailbox-sharded monthly naming:

```text
<archive-prefix>-<mailbox>-YYYY-MM
```

Each row stores:

```text
archive_group
entry_path
raw_eml
headers_json
metadata_json
summary_md
```

That gives agents:

- full raw MIME
- structured metadata
- a simple summary file
- SQL queries while you wait on Artifacts beta access

## Storage split

The live worker path now uses D1.

The older Artifacts implementation is still isolated in code, but it is not imported by the current worker path.
That keeps the later switch back to Artifacts contained to the storage layer instead of the whole app.

This is intentionally temporary. When Artifacts public beta is available for your account, switch the live
storage path back over and keep the rest of the Worker unchanged.

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
      config.ts
      email.ts
      storage/
        d1.ts
        index.ts
      artifacts.ts
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

- `d1_databases`
- `send_email`

You still need to:

- create or choose a D1 database
- enable Email Routing
- enable Email Sending if you want auto-replies
- route a journal mailbox to this Worker in the Cloudflare dashboard

The inbound email route is configured in Cloudflare Email Routing, not as a top-level `email` field in
`wrangler.jsonc`.

The default journal address is intentionally blank. Set your real journal mailbox in Cloudflare Email Routing and
then save that same address in the Worker UI after deployment instead of committing it to git.

### 5. Run the UI locally

```bash
npm run dev
```

## Recommended flow

### Inbound mail

1. Cloudflare routes `journal@yourdomain.com` to the Worker.
2. The `email()` handler reads the message metadata and raw MIME.
3. The Worker archives the message into D1.
4. The Worker optionally forwards the message and/or sends an auto-reply.

### Outbound mail

1. `cm` sends mail through the Email Service REST API.
2. `cm` BCCs the journal mailbox.
3. The journal copy comes back through Email Routing.
4. The Worker archives it in D1.

That gives you a sent-mail trail without relying on a sent-mail REST endpoint.

## Notes

- The UI lives at `/`, and `/config` exposes the current routing profile as JSON for agent tooling.
- D1 is a reasonable short-term fallback, but large raw MIME payloads and attachments are the first pressure point.
- The code is intended as a starting point; once Artifacts access lands, swap the storage layer instead of the whole Worker.
