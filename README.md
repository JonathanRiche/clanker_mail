# clanker_mail

`clanker_mail` is a Zig CLI for sending email through the Cloudflare Email Service REST API.

It sends directly to:

`POST /client/v4/accounts/{account_id}/email/sending/send`

This project does not use a Cloudflare Worker.

## Requirements

- Zig `0.16.0`
- A Cloudflare account with Email Sending configured
- A Cloudflare API token that can send email for the target account

## Install

```bash
zig build install -Doptimize=ReleaseFast --prefix "/home/rtg/.local"
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

## Worker scaffold

This repo now also includes a Cloudflare Worker scaffold in [worker/README.md](/home/rtg/development/clients/clanker_mail/worker/README.md).

That Worker is for the agent-driven path:

- inbound Email Routing handling
- Artifacts-backed config storage
- Artifacts-backed mailbox archives
- an RWSDK UI for editing the routing/archive profile

The Zig CLI and the Worker solve different problems:

- `cm`: send outbound email directly through the Email Service REST API
- `worker/`: receive and archive routed email, optionally forward or auto-reply, and expose a control UI

## Credentials

`clanker_mail` looks for these environment variables by default:

```bash
export CLOUDFLARE_ACCOUNT_ID="your-account-id"
export CLOUDFLARE_API_TOKEN="your-api-token"
```

If those are already set in the environment, you do **not** need to pass `--account-id` or `--api-token`.

You only need the flags when:

- You do not want to rely on environment variables
- You want to override the current shell environment for one command

## Basic usage

```bash
cm \
  --from welcome@example.com \
  --to user@example.com \
  --subject "Welcome" \
  --text "Thanks for signing up."
```

With explicit credentials:

```bash
cm \
  --account-id "$CLOUDFLARE_ACCOUNT_ID" \
  --api-token "$CLOUDFLARE_API_TOKEN" \
  --from welcome@example.com \
  --to user@example.com \
  --subject "Welcome" \
  --text "Thanks for signing up."
```

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

## Notes

- In normal message mode, credentials come from `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` unless you pass flags.
- In raw payload mode, `clanker_mail` sends your JSON body as-is.
- `--pretty` only affects CLI output formatting, not the request body sent to Cloudflare.
