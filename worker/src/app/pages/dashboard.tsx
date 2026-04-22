import type { DashboardModel } from "../../lib/types";

export function DashboardPage({ model }: { model: DashboardModel }) {
  const forwardText = model.config.forwardTo.length == 0
    ? "No forwarding targets configured yet."
    : model.config.forwardTo.join(", ");

  return (
    <main className="shell">
      <section className="masthead">
        <div>
          <span className="eyebrow">Agent Mail Control Room</span>
          <h1 className="title">Artifacts-first email routing.</h1>
          <p className="lede">
            This Worker treats inbound email as a versioned file tree. Messages land in mailbox-scoped
            monthly repos, config lives in a control repo, and agents can read the result as Git remotes,
            mounted filesystems, or ordinary files.
          </p>
        </div>
        <aside className="signal-card">
          <div className="stack">
            <div className="hero-stat">
              <strong className="mono">Control repo</strong>
              <span className="mono">{model.config.controlRepo}</span>
            </div>
            <div className="hero-stat">
              <strong className="mono">Archive preview</strong>
              <span className="mono">{model.archivePreviewRepo}</span>
            </div>
          </div>
          <div className="status good">
            The Worker archives every routed message as raw MIME plus structured metadata inside Artifacts.
          </div>
        </aside>
      </section>

      <section className="grid">
        <article className="form-card">
          <p className="section-label">Routing profile</p>
          <h2 className="section-title">Mailbox and archive configuration</h2>
          <p className="section-copy">
            Save these values into the Artifacts-backed control repo. The UI persists configuration to
            <span className="mono"> config/app.json </span>
            so the Worker and agents share the same source of truth.
          </p>

          <form action="/config" method="post">
            <div className="field-grid">
              <label>
                <span className="field-label">Control repo</span>
                <input name="controlRepo" defaultValue={model.config.controlRepo} />
              </label>

              <label>
                <span className="field-label">Archive repo prefix</span>
                <input name="archiveRepoPrefix" defaultValue={model.config.archiveRepoPrefix} />
              </label>

              <label className="wide">
                <span className="field-label">Journal address</span>
                <input name="journalAddress" defaultValue={model.config.journalAddress} />
              </label>

              <label className="wide">
                <span className="field-label">Forward targets</span>
                <input
                  name="forwardTo"
                  defaultValue={model.config.forwardTo.join(", ")}
                  placeholder="ops@example.com, archive@example.com"
                />
              </label>
            </div>

            <div className="checkbox-row">
              <input
                id="autoReplyEnabled"
                name="autoReplyEnabled"
                type="checkbox"
                defaultChecked={model.config.autoReply.enabled}
              />
              <label htmlFor="autoReplyEnabled">Enable automatic acknowledgement replies</label>
            </div>

            <div className="field-grid">
              <label className="wide">
                <span className="field-label">Auto-reply from address</span>
                <input name="autoReplyFrom" defaultValue={model.config.autoReply.from} />
              </label>

              <label className="wide">
                <span className="field-label">Auto-reply subject prefix</span>
                <input
                  name="autoReplySubjectPrefix"
                  defaultValue={model.config.autoReply.subjectPrefix}
                />
              </label>

              <label className="wide">
                <span className="field-label">Auto-reply text</span>
                <textarea name="autoReplyText" defaultValue={model.config.autoReply.text} />
              </label>

              <label className="wide">
                <span className="field-label">Auto-reply HTML</span>
                <textarea name="autoReplyHtml" defaultValue={model.config.autoReply.html} />
              </label>
            </div>

            <div className="button-row">
              <button type="submit">Save Configuration</button>
              {renderSaveState(model)}
            </div>
          </form>
        </article>

        <div className="stack">
          <article className="panel">
            <p className="section-label">Storage model</p>
            <h2 className="section-title">What gets written</h2>
            <ul className="metric-list">
              <li>
                <span className="metric-label">Archive strategy</span>
                <span className="metric-value mono">monthly-mailbox</span>
              </li>
              <li>
                <span className="metric-label">Archive repo</span>
                <span className="metric-value mono">{model.archivePreviewRepo}</span>
              </li>
              <li>
                <span className="metric-label">Message entry layout</span>
                <span className="metric-value mono">
                  messages/YYYY/MM/DD/HHMMSS-message-id/
                </span>
              </li>
              <li>
                <span className="metric-label">Forward targets</span>
                <span className="metric-value">{forwardText}</span>
              </li>
            </ul>
            <p className="footnote">
              Each message is archived as <span className="mono">raw.eml</span>,
              <span className="mono"> headers.json</span>,
              <span className="mono"> metadata.json</span>, and
              <span className="mono"> summary.md</span>. Agents can clone, mount, diff, or fork the repo.
            </p>
          </article>

          <article className="panel">
            <p className="section-label">Deployment checklist</p>
            <h2 className="section-title">Cloudflare steps</h2>
            <ol className="checklist">
              <li>Enable Email Routing and point the journal address at this Worker.</li>
              <li>Enable Email Sending if you want auto-replies or follow-up mail from the Worker.</li>
              <li>Create an Artifacts namespace and bind it as <span className="mono">ARTIFACTS</span>.</li>
              <li>BCC outbound mail from <span className="mono">cm</span> to the journal address to build a sent-mail archive.</li>
            </ol>
            <p className="footnote">
              The control repo can exist before the first email arrives, but it does not have to. The Worker
              creates repos lazily the first time config or mail is written.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}

function renderSaveState(model: DashboardModel) {
  switch (model.saveState) {
    case "saved":
      return <span className="status good">Configuration saved to Artifacts.</span>;
    case "error":
      return <span className="status bad">{model.errorMessage ?? "Failed to save configuration."}</span>;
    default:
      return (
        <span className="status">
          {model.configRepoExists
            ? "This screen is reading from the control repo."
            : "No control repo commit yet. Saving will create the repo and first commit."}
        </span>
      );
  }
}
