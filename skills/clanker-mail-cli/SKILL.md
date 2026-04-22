---
name: clanker-mail-cli
description: Use this skill when working in the clanker_mail repo on tasks that send email with the cm CLI, build or review cm commands, dry-run Cloudflare email payloads, or route mail into the journal mailbox for the Worker and Artifacts archive.
---

# clanker_mail CLI

Use this skill when the task is about the local `cm` executable in this repo.

This skill is for:

- sending email through Cloudflare Email Service from the CLI
- building a correct `cm` command for a user or another agent
- previewing the Cloudflare request body with `--dry-run`
- using `--bcc` to route a journal copy into the Worker flow

This skill is not for:

- changing Worker routing code unless the task is explicitly about `worker/`
- explaining generic SMTP workflows
- hand-writing Cloudflare API calls when `cm` already covers the task

## Core Rules

1. Prefer `cm` over manual REST calls when the task is "send email from this repo".
2. Prefer `zig build run -- ...` when running from the repo and the installed `cm` binary is not required.
3. Use `--dry-run --pretty` first unless the user clearly wants a live send.
4. Do not invent Cloudflare credentials, sender addresses, or destination addresses.
5. If a task includes journaling or agent-readable archives, include `--bcc <journal-address>`.

## Command Forms

Run from the repo without relying on global install:

```bash
zig build run -- \
  --from ops@example.com \
  --to user@example.com \
  --subject "Status update" \
  --text "Everything completed successfully."
```

Run the installed binary when the environment already has it:

```bash
cm \
  --from ops@example.com \
  --to user@example.com \
  --subject "Status update" \
  --text "Everything completed successfully."
```

## Preflight

Before a live send, check:

- `CLOUDFLARE_ACCOUNT_ID` is set, or `--account-id` is provided
- `CLOUDFLARE_API_TOKEN` is set, or `--api-token` is provided
- at least one `--to` is present
- `--from` is present
- `--subject` is present
- at least one of `--text` or `--html` is present

If the task is only to review or generate the payload, `--dry-run` is enough and credentials are not required.

## Safe Default Workflow

When the user asks for help sending mail but does not explicitly ask for a live send:

1. Build the command
2. Use `--dry-run --pretty`
3. Show or summarize the payload
4. Switch to a live send only if the user clearly wants the mail sent

Example:

```bash
zig build run -- \
  --dry-run \
  --pretty \
  --from bot@example.com \
  --to human@example.com \
  --subject "Task complete" \
  --text "The run finished successfully."
```

## Journaled Agent Flow

Use this when sent mail should also appear in the Worker + Artifacts archive.

```bash
zig build run -- \
  --from bot@example.com \
  --to human@example.com \
  --bcc journal@example.com \
  --subject "Task complete" \
  --text "The run finished successfully."
```

Expected flow:

1. `cm` sends outbound mail through Cloudflare Email Service
2. the journal mailbox receives the BCC copy
3. Cloudflare Email Routing forwards that copy to the Worker
4. the Worker stores the message in Artifacts

## Common Patterns

Plain text plus HTML:

```bash
cm \
  --from ops@example.com \
  --to user@example.com \
  --subject "Status update" \
  --text "Everything completed successfully." \
  --html "<p><strong>Everything completed successfully.</strong></p>"
```

Multiple recipients:

```bash
cm \
  --from ops@example.com \
  --to a@example.com \
  --to b@example.com \
  --cc team@example.com \
  --subject "Batch notice" \
  --text "Hello everyone."
```

Read bodies from files:

```bash
cm \
  --from ops@example.com \
  --to user@example.com \
  --subject "Newsletter" \
  --text-file body.txt \
  --html-file body.html
```

Raw payload mode:

```bash
cm \
  --payload-file payload.json \
  --pretty
```

In raw payload mode, do not combine `--payload-json` or `--payload-file` with message-mode flags like `--to`,
`--from`, `--subject`, `--text`, `--html`, headers, or attachments.

## Output Expectations

- `--pretty` only changes CLI output formatting
- `--dry-run` prints the request body instead of sending
- a non-success API response causes a non-zero exit code

## References

For broader product and Cloudflare setup guidance, see [README.md](/home/rtg/development/clients/clanker_mail/README.md).
