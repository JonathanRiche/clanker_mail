import type { ReactNode } from "react";

export function Document({ children }: { children?: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>clanker_mail control room</title>
        <style>{globalStyles}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}

const globalStyles = `
  :root {
    --paper: #f4ede1;
    --paper-strong: #eadcc4;
    --ink: #15120f;
    --muted: #5e554b;
    --signal: #d6522c;
    --signal-soft: rgba(214, 82, 44, 0.16);
    --card: rgba(255, 249, 240, 0.76);
    --line: rgba(21, 18, 15, 0.14);
    --shadow: 0 24px 60px rgba(55, 30, 18, 0.16);
  }

  * {
    box-sizing: border-box;
  }

  html {
    min-height: 100%;
    background:
      radial-gradient(circle at top left, rgba(214, 82, 44, 0.24), transparent 22rem),
      radial-gradient(circle at right 20%, rgba(22, 93, 74, 0.18), transparent 24rem),
      linear-gradient(180deg, #fff7ea 0%, var(--paper) 44%, #efe2c8 100%);
    color: var(--ink);
    font-family: "Iowan Old Style", "Palatino Linotype", "Book Antiqua", Palatino, Georgia, serif;
  }

  body {
    margin: 0;
    min-height: 100vh;
    background-image:
      linear-gradient(rgba(21, 18, 15, 0.03) 1px, transparent 1px),
      linear-gradient(90deg, rgba(21, 18, 15, 0.03) 1px, transparent 1px);
    background-size: 2.6rem 2.6rem;
  }

  a {
    color: inherit;
  }

  .shell {
    width: min(1180px, calc(100vw - 3rem));
    margin: 0 auto;
    padding: 3rem 0 4rem;
  }

  .masthead {
    display: grid;
    grid-template-columns: 1.4fr 0.8fr;
    gap: 1.5rem;
    align-items: end;
    margin-bottom: 1.8rem;
  }

  .eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 0.55rem;
    padding: 0.45rem 0.7rem;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.52);
    text-transform: uppercase;
    letter-spacing: 0.22em;
    font: 600 0.74rem/1 "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }

  .title {
    margin: 0.9rem 0 0.8rem;
    max-width: 11ch;
    font-size: clamp(3.2rem, 7vw, 7rem);
    line-height: 0.94;
    letter-spacing: -0.06em;
  }

  .lede {
    margin: 0;
    max-width: 42rem;
    color: var(--muted);
    font-size: 1.08rem;
    line-height: 1.7;
  }

  .signal-card,
  .panel,
  .form-card {
    position: relative;
    overflow: hidden;
    border: 1px solid var(--line);
    background: var(--card);
    box-shadow: var(--shadow);
    backdrop-filter: blur(18px);
  }

  .signal-card {
    min-height: 15rem;
    padding: 1.2rem 1.25rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .signal-card::before,
  .panel::before,
  .form-card::before {
    content: "";
    position: absolute;
    inset: 0 auto auto 0;
    width: 100%;
    height: 0.4rem;
    background: linear-gradient(90deg, var(--signal), rgba(214, 82, 44, 0.18));
  }

  .mono {
    font-family: "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }

  .stack {
    display: grid;
    gap: 1.25rem;
  }

  .hero-stat {
    display: grid;
    gap: 0.4rem;
  }

  .hero-stat strong {
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
  }

  .hero-stat span {
    font-size: 1.5rem;
    line-height: 1.2;
  }

  .grid {
    display: grid;
    grid-template-columns: 1.1fr 0.9fr;
    gap: 1.35rem;
  }

  .form-card,
  .panel {
    padding: 1.35rem;
  }

  .section-label {
    margin: 0 0 0.65rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font: 600 0.76rem/1 "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }

  .section-title {
    margin: 0;
    font-size: clamp(1.55rem, 3vw, 2.6rem);
    line-height: 1;
    letter-spacing: -0.05em;
  }

  .section-copy {
    margin: 0.75rem 0 0;
    color: var(--muted);
    line-height: 1.65;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.9rem 1rem;
    margin-top: 1.25rem;
  }

  .field-grid .wide {
    grid-column: 1 / -1;
  }

  label {
    display: grid;
    gap: 0.45rem;
    font-size: 0.94rem;
  }

  .field-label {
    color: var(--muted);
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  input,
  textarea,
  select {
    width: 100%;
    padding: 0.85rem 0.95rem;
    border: 1px solid rgba(21, 18, 15, 0.18);
    background: rgba(255, 255, 255, 0.84);
    color: var(--ink);
    font: inherit;
    resize: vertical;
  }

  textarea {
    min-height: 8rem;
  }

  .checkbox-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1rem 0 0.2rem;
    padding: 0.85rem 1rem;
    border: 1px dashed rgba(21, 18, 15, 0.18);
    background: rgba(255, 255, 255, 0.48);
  }

  .checkbox-row input {
    width: auto;
    margin: 0;
  }

  .button-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.9rem;
    align-items: center;
    margin-top: 1.35rem;
  }

  button {
    appearance: none;
    border: 0;
    padding: 0.95rem 1.2rem;
    background: linear-gradient(135deg, #1d1813, #574739);
    color: white;
    font: 700 0.92rem/1 "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    cursor: pointer;
  }

  .status {
    padding: 0.85rem 1rem;
    border: 1px solid var(--line);
    background: rgba(255, 255, 255, 0.68);
    color: var(--muted);
    font-size: 0.92rem;
  }

  .status.good {
    background: rgba(30, 127, 99, 0.12);
    color: #154f40;
  }

  .status.bad {
    background: rgba(214, 82, 44, 0.12);
    color: #8d2e17;
  }

  .metric-list,
  .checklist {
    display: grid;
    gap: 0.75rem;
    margin: 1.2rem 0 0;
    padding: 0;
    list-style: none;
  }

  .metric-list li,
  .checklist li {
    padding: 0.95rem 1rem;
    border: 1px solid rgba(21, 18, 15, 0.14);
    background: rgba(255, 255, 255, 0.5);
  }

  .metric-label {
    display: block;
    margin-bottom: 0.35rem;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font: 600 0.72rem/1 "IBM Plex Mono", "SFMono-Regular", Consolas, monospace;
  }

  .metric-value {
    font-size: 1.2rem;
    line-height: 1.35;
  }

  .footnote {
    margin-top: 1rem;
    color: var(--muted);
    font-size: 0.92rem;
    line-height: 1.6;
  }

  @media (max-width: 960px) {
    .masthead,
    .grid {
      grid-template-columns: 1fr;
    }

    .title {
      max-width: none;
    }
  }

  @media (max-width: 720px) {
    .shell {
      width: min(100vw - 1.5rem, 100%);
      padding-top: 1.5rem;
    }

    .field-grid {
      grid-template-columns: 1fr;
    }
  }
`;
