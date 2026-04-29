# clanker_mail

`clanker_mail` is a Cloudflare email toolchain built around a Zig CLI called `cm`.

At its core, `cm` sends outbound email directly through the Cloudflare Email Service REST API:

`POST /client/v4/accounts/{account_id}/email/sending/send`

That means:

- you can send mail from scripts, agents, or terminals without building a Worker just to send mail
- you can use normal Cloudflare account credentials and Email Sending configuration
- you still have the option to add a Cloudflare Worker for journaling, archiving, and agent-readable mail storage

This repo contains two related pieces:

- `cm`: the outbound mail CLI
- `worker/`: an optional Cloudflare Worker for inbound Email Routing, D1-backed archives for now, and a small control UI

The worker is using D1 only as a temporary fallback until Cloudflare Artifacts is available in public beta for
this project.

If all you want is outbound mail, you only need `cm`.
If you want agents to keep a versioned mail archive, use `cm` together with the Worker.

## What It Is

`clanker_mail` is for people who want Cloudflare to be the mail transport, but want a simpler interface than hand-writing REST requests every time.

Use it when you want to:

- send transactional mail from scripts or automation
- let agents send email from the command line
- preview the exact Cloudflare JSON payload before sending
- optionally journal sent mail into Cloudflare Email Routing and the Worker archive

The CLI is intentionally narrow:

- it sends email through Cloudflare's REST API
- it does not require a Worker for outbound sending
- it can be paired with a Worker if you want mailbox journaling and archive storage

## How It Fits With Cloudflare

There are two separate Cloudflare features involved:

1. Email Sending
   This is what `cm` uses to send outbound mail through the REST API.
2. Email Routing
   This is what the optional Worker uses to receive journal copies of mail and archive them.

So the simplest setup is:

1. Enable Cloudflare Email Sending
2. Install `cm`
3. Set your Cloudflare credentials
4. Run `cm --from ... --to ... --subject ... --text ...`

The more advanced agent-driven setup is:

1. `cm` sends outbound mail through the Email Service REST API
2. `cm` BCCs a journal mailbox
3. Cloudflare Email Routing sends that journal copy to your Worker
4. The Worker stores the message in D1 for now, with the Artifacts storage path isolated for a later switch

## Requirements

- Zig `0.16.0`
- A Cloudflare account with Email Sending configured
- A Cloudflare API token that can send email for the target account

## Install

```bash
mise run build
```

That installs the CLI to:

```bash
/home/rtg/.local/bin/cm
```

If `/home/rtg/.local/bin` is already in `PATH`, the command to run is simply:

```bash
cm
```

This repo is still named `clanker_mail`, but the installed executable is abbreviated to `cm`.

## Credentials

`clanker_mail` looks for these environment variables by default:

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
export CM_WORKER_BASE_URL="https://your-worker.example.workers.dev"
export CM_WORKER_API_TOKEN="your-worker-read-token"
```

If those are already set in the environment, you do **not** need to pass `--account-id` or `--api-token`.
The worker values are only needed when you use `cm read`.

You only need the flags when:

- You do not want to rely on environment variables
- You want to override the current shell environment for one command

## Quick Start

Set credentials:

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
```

Send one email:

```bash
cm \
  --from welcome@example.com \
  --to user@example.com \
  --subject "Welcome" \
  --text "Thanks for signing up."
```

List recent archived inbound mail from the deployed worker:

```bash
cm read list --pretty
```

Fetch one archived message in detail:

```bash
cm read get 550e8400-e29b-41d4-a716-446655440000 --pretty
```

If you want the sent message to also land in your journal/archive flow, add a BCC to the journal address:

```bash
cm \
  --from welcome@example.com \
  --to user@example.com \
  --bcc journal@example.com \
  --subject "Welcome" \
  --text "Thanks for signing up."
```

With explicit credentials instead of environment variables:

```bash
cm \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --api-token "$CLOUDFLARE_API_TOKEN" \
  --from welcome@example.com \
  --to user@example.com \
  --subject "Welcome" \
  --text "Thanks for signing up."
```

## Common Cloudflare Setup

### Outbound sending only

For plain outbound sending with `cm`, you need:

1. A Cloudflare account
2. Email Sending configured for the sender/domain you want to use
3. A Cloudflare API token that can send mail for the target account

Once those exist, `cm` can send directly to Cloudflare's REST API.

### Outbound sending plus agent archive

If you also want agent-readable archives, add the Worker path:

1. Enable Email Routing in Cloudflare
2. Pick a journal mailbox such as `journal@yourdomain.com`
3. Deploy the Worker in `worker/`
4. Route the journal mailbox to that Worker
5. Bind `DB`
6. Bind `EMAIL` if you want Worker-driven auto-replies
7. Use `cm` with `--bcc journal@yourdomain.com`

That gives you both:

- direct outbound sending from `cm`
- a mailbox archive the Worker can hold in D1 until Artifacts access is ready

## Common options

```text
--to <email>             Repeat for multiple recipients
--cc <email>             Optional; repeatable
--bcc <email>            Optional; repeatable
--from <email>           Sender address
--from-name <name>       Optional sender display name
--reply-to <email>       Optional reply-to address
--subject <text>         Subject line
--text <body>            Plain text body
--text-file <path|->     Read plain text body from file or stdin
--html <body>            HTML body
--html-file <path|->     Read HTML body from file or stdin
--header 'Name: Value'   Custom header; repeatable
--attach <path>          Attach a file as application/octet-stream
--pretty                 Pretty-print JSON output
--dry-run                Print the payload instead of sending
```

## Daily Usage

### Send a plain text message

```bash
cm \
  --from ops@example.com \
  --to user@example.com \
  --subject "Status update" \
  --text "Everything completed successfully."
```

### Send HTML too

```bash
cm \
  --from ops@example.com \
  --to user@example.com \
  --subject "Status update" \
  --text "Everything completed successfully." \
  --html "<p><strong>Everything completed successfully.</strong></p>"
```

### Send to multiple recipients

```bash
cm \
  --from ops@example.com \
  --to a@example.com \
  --to b@example.com \
  --cc team@example.com \
  --subject "Batch notice" \
  --text "Hello everyone."
```

### Read body content from files

```bash
cm \
  --from ops@example.com \
  --to user@example.com \
  --subject "Newsletter" \
  --text-file body.txt \
  --html-file body.html
```

### Read archived mail from the worker

Recent messages:

```bash
cm read list --limit 10 --pretty
```

One message in detail:

```bash
cm read get <message-row-id> --pretty
```

The worker read path uses the deployed Worker API, not `wrangler d1` or direct SQL access. Configure it with
either CLI flags:

```bash
cm read list \
  --worker-base-url "https://your-worker.example.workers.dev" \
  --worker-api-token "$CM_WORKER_API_TOKEN" \
  --pretty
```

or environment variables:

```bash
export CM_WORKER_BASE_URL="https://your-worker.example.workers.dev"
export CM_WORKER_API_TOKEN="your-worker-read-token"
```

For local shell setup, copy `.env.example` to `.env`, fill in real values, and source it in your shell.

## Dry run

Use `--dry-run` to see the exact JSON body that will be sent:

```bash
cm \
  --dry-run \
  --pretty \
  --from welcome@example.com \
  --from-name "Welcome Bot" \
  --to user@example.com \
  --subject "Welcome" \
  --text "Hello from clanker_mail"
```

## Raw payload mode

If you want to send a hand-written Cloudflare request body, use one of:

- `--payload-json <json>`
- `--payload-file <path|->`

Example:

```bash
cm \
  --payload-file payload.json \
  --pretty
```

This mode is useful when Cloudflare adds fields you want to use directly without waiting for the CLI to grow new flags.

## Agent Workflow

If you want agents to use `clanker_mail` as both a sender and a mail journal, the intended workflow is:

1. An agent runs `cm` to send outbound mail through Cloudflare
2. The command includes `--bcc journal@yourdomain.com`
3. Cloudflare Email Routing sends that journal copy to the Worker
4. The Worker writes the message into D1 for now
5. Agents read the stored mail from the Worker's backing store

In practice, the command agents usually run looks like:

```bash
cm \
  --from bot@example.com \
  --to human@example.com \
  --bcc journal@example.com \
  --subject "Task complete" \
  --text "The run finished successfully."
```

## Worker Setup

This repo includes a Worker scaffold in [worker/README.md](/home/rtg/development/clients/clanker_mail/worker/README.md).

Use it when you want:

- inbound Email Routing handling
- D1-backed mailbox archives for now
- a config store the Worker can later migrate back to Artifacts
- a small RWSDK UI for editing the routing profile
- optional forwarding or auto-replies from the Worker

Local setup for the Worker:

```bash
cd worker
npm install
npm run typecheck
npm run build
```

If you want Wrangler to regenerate exact local binding types:

```bash
XDG_CONFIG_HOME=/tmp npx wrangler types
```

Create the D1 database and local-only Wrangler config:

```bash
cd worker
npx wrangler d1 create clanker-mail --binding DB
cp wrangler.local.jsonc.example wrangler.local.jsonc
```

Then deploy:

```bash
cd worker
npm run build
npx wrangler deploy dist/worker/index.js --config dist/worker/wrangler.json
```

After deployment:

1. Route your journal mailbox to the Worker in Cloudflare Email Routing
2. Open the Worker UI at `/`
3. Save the control/archive configuration
4. Start sending mail with `cm --bcc journal@yourdomain.com`

## Notes

- In normal message mode, credentials come from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` unless you pass flags.
- In raw payload mode, `clanker_mail` sends your JSON body as-is.
- `--pretty` only affects CLI output formatting, not the request body sent to Cloudflare.
- The `worker/` project has been verified locally with `npm run typecheck` and `npm run build`.
- The CLI is the outbound sender. The Worker is optional and handles routing/archive concerns.
