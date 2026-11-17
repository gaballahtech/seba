/**
 * Styles for the `<seba-login>` card and its option dialogs.
 *
 * Kept as a string so the element stays a single shadow root with no runtime
 * style injection or external CSS dependency.
 */
export const CARD_STYLES = `
:host {
  display: block;
  width: min(25rem, 100%);
  --seba-accent: #7c3aed;
  --seba-accent-deep: #5b21b6;
  --seba-accent-contrast: #ffffff;
  --seba-surface: #ffffff;
  --seba-raised: #ffffff;
  --seba-text: #1b1b1f;
  --seba-muted: #6b6a75;
  --seba-border: #e4e1ef;
  --seba-tile: #f3effe;
  --seba-hover: #f8f5ff;
  --seba-ring: rgba(124, 58, 237, 0.35);
  --seba-shadow: 0 24px 64px -18px rgba(27, 17, 51, 0.38);
  font: 500 14px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--seba-text);
}
:host([theme="dark"]) {
  --seba-surface: #14121a;
  --seba-raised: #1d1928;
  --seba-text: #f5f3ff;
  --seba-muted: #a7a2b8;
  --seba-border: #37304a;
  --seba-tile: #2a2340;
  --seba-hover: #251e34;
  --seba-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.7);
}
:host([hidden]), [hidden] { display: none !important; }

.card {
  position: relative;
  padding: 1.35rem;
  border: 1px solid var(--seba-border);
  border-radius: 1.15rem;
  background: var(--seba-surface);
  box-shadow: 0 1px 2px rgba(27, 17, 51, 0.05), var(--seba-shadow);
}
.head { display: flex; align-items: center; gap: 0.7rem; margin-bottom: 1rem; }
.brand {
  width: 2.35rem; height: 2.35rem; flex: none; padding: 0.22rem;
  border-radius: 0.65rem; background: var(--seba-tile); object-fit: contain;
}
.title { margin: 0; font-size: 1.12rem; font-weight: 680; letter-spacing: -0.015em; }
.sub { margin: 0.18rem 0 0; font-size: 0.82rem; color: var(--seba-muted); }

.providers { display: flex; flex-direction: column; gap: 0.45rem; }
.provider {
  position: relative; display: flex; align-items: center; gap: 0.7rem;
  padding: 0.55rem 0.65rem; border: 1px solid var(--seba-border);
  border-radius: 0.8rem; background: var(--seba-raised);
  transition: border-color 120ms ease, background-color 120ms ease, transform 120ms ease;
}
.provider:hover { border-color: var(--seba-accent); background: var(--seba-hover); transform: translateY(-1px); }
.provider-hit {
  position: absolute; inset: 0; width: 100%; height: 100%;
  border: 0; border-radius: inherit; background: transparent; cursor: pointer;
}
.provider-hit:focus-visible { outline: 3px solid var(--seba-ring); outline-offset: 2px; }
.provider-hit:disabled { cursor: progress; }
.tile { width: 2rem; height: 2rem; flex: none; border-radius: 0.55rem; object-fit: contain; }
.pmeta { display: flex; flex-direction: column; gap: 0.05rem; min-width: 0; flex: 1; pointer-events: none; }
.pname { font-weight: 650; font-size: 0.92rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.psite {
  position: relative; z-index: 1; width: fit-content; pointer-events: auto;
  font-size: 0.76rem; color: var(--seba-muted); text-decoration: none;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.psite:hover { color: var(--seba-accent); text-decoration: underline; }
.chev { display: inline-flex; flex: none; color: var(--seba-muted); }
.chev svg { display: block; width: 1.05rem; height: 1.05rem; }

.more {
  width: 100%; height: 2.35rem; margin-top: 0.5rem;
  border: 1px solid var(--seba-border); border-radius: 0.8rem;
  background: var(--seba-raised); color: var(--seba-muted);
  font: inherit; font-size: 1.15rem; line-height: 1; letter-spacing: 0.16em;
  cursor: pointer; transition: background-color 120ms ease, border-color 120ms ease;
}
.more:hover { border-color: var(--seba-accent); background: var(--seba-hover); color: var(--seba-text); }
.more:focus-visible { outline: 3px solid var(--seba-ring); outline-offset: 2px; }
.create { margin: 0.7rem 0 0; text-align: center; font-size: 0.82rem; color: var(--seba-muted); }
.create-open {
  border: 0; background: none; padding: 0; font: inherit; font-weight: 650;
  color: var(--seba-accent); cursor: pointer;
}
.create-open:hover { text-decoration: underline; }
.create-open:focus-visible { outline: 2px solid var(--seba-ring); border-radius: 0.25rem; }

.or {
  display: flex; align-items: center; gap: 0.7em;
  margin: 1rem 0 0.85rem; color: var(--seba-muted);
  font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em;
}
.or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--seba-border); }

.webid-form { display: flex; flex-direction: column; gap: 0.5rem; }
.field-label { font-size: 0.78rem; font-weight: 600; color: var(--seba-muted); }
.combo {
  display: flex; align-items: stretch; overflow: hidden;
  border: 1px solid var(--seba-border); border-radius: 0.75rem;
  background: var(--seba-raised); transition: border-color 120ms ease, box-shadow 120ms ease;
}
.combo:focus-within { border-color: var(--seba-accent); box-shadow: 0 0 0 3px var(--seba-ring); }
.prefix-wrap {
  position: relative; display: flex; align-items: center; gap: 0.3rem;
  flex: none; max-width: 48%; padding-inline-start: 0.55rem;
  background: var(--seba-tile); border-inline-end: 1px solid var(--seba-border);
}
.prefix-icon { width: 1.25rem; height: 1.25rem; flex: none; border-radius: 0.3rem; object-fit: contain; }
.prefix {
  appearance: none; -webkit-appearance: none; border: 0; background: transparent;
  color: inherit; font: inherit; font-size: 0.78rem; font-weight: 600;
  max-width: 9.5rem; padding: 0.65rem 1.1rem 0.65rem 0; cursor: pointer;
  text-overflow: ellipsis;
}
.prefix:focus-visible { outline: none; }
.prefix-chev { position: absolute; inset-inline-end: 0.3rem; display: flex; color: var(--seba-muted); pointer-events: none; }
.prefix-chev svg { width: 0.9rem; height: 0.9rem; }
.webid-input {
  flex: 1; min-width: 0; border: 0; background: transparent; color: inherit;
  font: inherit; font-size: 0.85rem; padding: 0.65rem 0.7rem;
}
.webid-input::placeholder { color: var(--seba-muted); }
.webid-input:focus-visible { outline: none; }
.continue {
  padding: 0.65rem 1rem; border: 0; border-radius: 0.75rem;
  background: linear-gradient(135deg, var(--seba-accent), var(--seba-accent-deep));
  color: #fff; font: inherit; font-weight: 650; cursor: pointer;
  transition: filter 120ms ease;
}
.continue:hover:not(:disabled) { filter: brightness(1.08); }
.continue:focus-visible { outline: 3px solid var(--seba-ring); outline-offset: 2px; }
.continue:disabled { opacity: 0.65; cursor: progress; }

.notice {
  margin: 0.1rem 0 0; padding: 0.55rem 0.7rem; font-size: 0.8rem;
  border-radius: 0.6rem; background: #fdeced; color: #8a1c2b;
}
:host([theme="dark"]) .notice { background: #3b1d25; color: #ffb4c0; }

.signed-in { display: flex; flex-direction: column; gap: 0.45rem; }
.eyebrow { margin: 0; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--seba-muted); }
.account-webid {
  margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 0.8rem; overflow-wrap: anywhere; color: var(--seba-text);
}
.signout {
  margin-top: 0.5rem; padding: 0.6rem 1rem; border: 1px solid var(--seba-border);
  border-radius: 0.75rem; background: var(--seba-raised); color: inherit;
  font: inherit; font-weight: 600; cursor: pointer;
}
.signout:hover { border-color: var(--seba-accent); background: var(--seba-hover); }
.signout:focus-visible { outline: 3px solid var(--seba-ring); outline-offset: 2px; }

.overlay {
  position: fixed; inset: 0; z-index: 2147483646; display: flex;
  align-items: center; justify-content: center; padding: 1rem;
  background: rgba(24, 16, 43, 0.45); backdrop-filter: blur(3px);
  animation: seba-fade 150ms ease;
}
.dialog {
  width: min(23rem, calc(100vw - 2rem)); max-height: calc(100vh - 2rem);
  overflow: auto; padding: 1.1rem 1.1rem 1rem; border-radius: 1.1rem;
  background: var(--seba-surface); color: var(--seba-text);
  box-shadow: var(--seba-shadow); animation: seba-pop 160ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.dhead { display: flex; align-items: center; gap: 0.35rem; }
.dhead h2 { flex: 1; margin: 0; font-size: 1.02rem; font-weight: 680; letter-spacing: -0.01em; }
.back, .dialog-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; flex: none; border: 0; border-radius: 50%;
  background: transparent; color: var(--seba-muted); font-size: 1.05rem; cursor: pointer;
}
.back:hover, .dialog-close:hover { background: var(--seba-hover); color: var(--seba-text); }
.back:focus-visible, .dialog-close:focus-visible { outline: 2px solid var(--seba-ring); outline-offset: 1px; }
.back svg { width: 1.15rem; height: 1.15rem; }
.dsub { margin: 0.15rem 0 0.8rem; font-size: 0.8rem; color: var(--seba-muted); }
.dbody { display: flex; flex-direction: column; gap: 0.45rem; }
.choice {
  display: flex; align-items: center; gap: 0.65rem; width: 100%;
  padding: 0.55rem 0.6rem; border: 1px solid var(--seba-border);
  border-radius: 0.75rem; background: var(--seba-raised); color: inherit;
  font: inherit; text-align: start; text-decoration: none; cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease;
}
.choice:hover { border-color: var(--seba-accent); background: var(--seba-hover); }
.choice:focus-visible { outline: 3px solid var(--seba-ring); outline-offset: 2px; }
.choice:disabled { opacity: 0.55; cursor: not-allowed; }
.choice-icon { width: 2rem; height: 2rem; flex: none; border-radius: 0.55rem; object-fit: contain; }
.glyph { display: flex; align-items: center; justify-content: center; background: var(--seba-tile); color: var(--seba-accent); }
.glyph svg { width: 1.15rem; height: 1.15rem; }
.choice-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.choice-title { font-size: 0.88rem; font-weight: 650; }
.choice-sub { font-size: 0.74rem; color: var(--seba-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.badge { flex: none; padding: 0.2rem 0.5rem; border-radius: 999px; background: var(--seba-tile); color: var(--seba-accent); font-size: 0.68rem; font-weight: 700; }
.dfoot { margin-top: 0.75rem; text-align: center; font-size: 0.78rem; }
.dfoot a { color: var(--seba-accent); font-weight: 600; text-decoration: none; }
.dfoot a:hover { text-decoration: underline; }
.empty { margin: 0.2rem 0; font-size: 0.8rem; color: var(--seba-muted); }

@keyframes seba-fade { from { opacity: 0; } }
@keyframes seba-pop { from { opacity: 0; transform: translateY(-6px) scale(0.985); } }
@media (prefers-reduced-motion: reduce) {
  .overlay, .dialog, .provider, .continue { animation: none; transition: none; }
}
`;
