/**
 * Styles for the `<seba-login>` card and its option dialogs.
 *
 * Kept as a string so the element stays a single shadow root with no runtime
 * style injection or external CSS dependency.
 */
export const CARD_STYLES = `
:host {
  display: block;
  width: min(24.5rem, 100%);
  margin-inline: auto;
  color-scheme: light;
  --seba-accent: #6d28d9;
  --seba-accent-deep: #5b21b6;
  --seba-accent-contrast: #ffffff;
  --seba-link: #6d28d9;
  --seba-surface: #ffffff;
  --seba-raised: #ffffff;
  --seba-text: #141416;
  --seba-muted: #6b6b75;
  --seba-border: #e7e7ec;
  --seba-border-strong: #d5d5dd;
  --seba-tile: #f3effe;
  --seba-hover: #f7f7f9;
  --seba-ring: rgba(109, 40, 217, 0.18);
  --seba-shadow: 0 1px 2px rgba(16, 16, 24, 0.04), 0 24px 56px -28px rgba(16, 16, 24, 0.28);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  font-size: 15px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--seba-text);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
:host([theme="dark"]) {
  color-scheme: dark;
  --seba-accent: #7c3aed;
  --seba-accent-deep: #8b5cf6;
  --seba-accent-contrast: #ffffff;
  --seba-link: #c4b5fd;
  --seba-surface: #141417;
  --seba-raised: #1b1b20;
  --seba-text: #f4f4f5;
  --seba-muted: #a1a1aa;
  --seba-border: #2c2c33;
  --seba-border-strong: #3f3f48;
  --seba-tile: #251b3f;
  --seba-hover: #1c1c21;
  --seba-ring: rgba(139, 92, 246, 0.3);
  --seba-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 24px 56px -24px rgba(0, 0, 0, 0.75);
}
@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"]):not([theme="dark"])) {
    color-scheme: dark;
    --seba-accent: #7c3aed;
    --seba-accent-deep: #8b5cf6;
    --seba-accent-contrast: #ffffff;
    --seba-link: #c4b5fd;
    --seba-surface: #141417;
    --seba-raised: #1b1b20;
    --seba-text: #f4f4f5;
    --seba-muted: #a1a1aa;
    --seba-border: #2c2c33;
    --seba-border-strong: #3f3f48;
    --seba-tile: #251b3f;
    --seba-hover: #1c1c21;
    --seba-ring: rgba(139, 92, 246, 0.3);
    --seba-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 24px 56px -24px rgba(0, 0, 0, 0.75);
  }
}
:host([hidden]), [hidden] { display: none !important; }
*, *::before, *::after { box-sizing: border-box; }

.card {
  position: relative;
  padding: 26px 24px 22px;
  border: 1px solid var(--seba-border);
  border-radius: 22px;
  background: var(--seba-surface);
  box-shadow: var(--seba-shadow);
}

/* ---------- Header ---------- */
.head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin-bottom: 24px;
  text-align: center;
}
.brand {
  display: block;
  width: 48px;
  height: 48px;
  padding: 9px;
  border-radius: 15px;
  background: var(--seba-tile);
  object-fit: contain;
}
.title {
  margin: 0;
  font-size: 1.375rem;
  font-weight: 650;
  line-height: 1.25;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.sub {
  max-width: 19rem;
  margin: 6px auto 0;
  color: var(--seba-muted);
  font-size: 0.875rem;
  font-weight: 400;
  line-height: 1.5;
  text-wrap: balance;
}

/* ---------- Provider rows ---------- */
.providers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.provider {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 58px;
  padding: 10px 12px;
  border: 1px solid var(--seba-border);
  border-radius: 14px;
  background: var(--seba-surface);
  transition: border-color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}
.provider:hover {
  border-color: var(--seba-border-strong);
  background: var(--seba-hover);
}
.provider-hit {
  position: absolute;
  inset: 0;
  z-index: 0;
  padding: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  font: inherit;
  color: inherit;
  cursor: pointer;
}
.provider-hit:focus-visible {
  outline: 2px solid var(--seba-accent);
  outline-offset: 2px;
}
.provider-hit:disabled { cursor: progress; }
.provider-hit:disabled ~ * { opacity: 0.6; }
.tile {
  flex: none;
  width: 34px;
  height: 34px;
  border-radius: 9px;
  object-fit: contain;
  pointer-events: none;
}
.pmeta {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  pointer-events: none;
}
.pname {
  overflow: hidden;
  font-size: 0.9375rem;
  font-weight: 600;
  line-height: 1.35;
  letter-spacing: -0.005em;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.psite {
  position: relative;
  z-index: 1;
  align-self: flex-start;
  max-width: 100%;
  overflow: hidden;
  color: var(--seba-muted);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: auto;
}
.psite:hover { color: var(--seba-link); text-decoration: underline; text-underline-offset: 2px; }
.pmeta > .psite { cursor: pointer; }
.chev {
  flex: none;
  display: inline-flex;
  color: var(--seba-muted);
  opacity: 0.7;
  pointer-events: none;
  transition: transform 160ms ease, opacity 160ms ease;
}
.chev svg { width: 17px; height: 17px; }
.provider:hover .chev { transform: translateX(2px); opacity: 1; }

/* ---------- More + create ---------- */
.more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 38px;
  margin: 10px auto 0;
  padding: 0 14px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--seba-muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
.more:hover { background: var(--seba-hover); color: var(--seba-text); }
.more:focus-visible,
.create-open:focus-visible,
.signout:focus-visible,
.dialog-back:focus-visible,
.dialog-close:focus-visible,
.choice:focus-visible {
  outline: 2px solid var(--seba-accent);
  outline-offset: 2px;
}
.more-dots {
  font-size: 1.125rem;
  line-height: 1;
  letter-spacing: 0.04em;
  transform: translateY(-2px);
}
.create {
  margin: 6px 0 0;
  color: var(--seba-muted);
  font-size: 0.8125rem;
  text-align: center;
}
.create-open {
  padding: 0;
  border: 0;
  border-radius: 4px;
  background: none;
  color: var(--seba-link);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-underline-offset: 2px;
}
.create-open:hover { text-decoration: underline; }
.create-open:disabled { cursor: progress; }

/* ---------- Divider ---------- */
.or {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 22px 0 16px;
  color: var(--seba-muted);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.or::before,
.or::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--seba-border);
}

/* ---------- WebID field ---------- */
.webid-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.field-label {
  color: var(--seba-text);
  font-size: 0.8125rem;
  font-weight: 600;
}
.combo {
  display: flex;
  align-items: stretch;
  min-height: 50px;
  overflow: hidden;
  border: 1px solid var(--seba-border);
  border-radius: 14px;
  background: var(--seba-surface);
  transition: border-color 160ms ease, box-shadow 160ms ease;
}
.combo:focus-within {
  border-color: var(--seba-accent);
  box-shadow: 0 0 0 4px var(--seba-ring);
}
.prefix-wrap {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: 7px;
  max-width: 52%;
  padding-inline-start: 12px;
  border-inline-end: 1px solid var(--seba-border);
  background: var(--seba-hover);
}
.prefix-icon {
  flex: none;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  object-fit: contain;
}
.prefix {
  max-width: 9.5rem;
  padding: 13px 24px 13px 0;
  border: 0;
  background: transparent;
  color: var(--seba-text);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  text-overflow: ellipsis;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
}
.prefix:focus { outline: none; }
.prefix-chev {
  position: absolute;
  inset-inline-end: 8px;
  display: inline-flex;
  color: var(--seba-muted);
  pointer-events: none;
}
.prefix-chev svg { width: 16px; height: 16px; }
.webid-input {
  flex: 1;
  min-width: 0;
  padding: 13px 14px;
  border: 0;
  background: transparent;
  color: var(--seba-text);
  font: inherit;
  font-size: 0.9375rem;
}
.webid-input::placeholder { color: var(--seba-muted); opacity: 0.8; }
.webid-input:focus { outline: none; }

.continue {
  min-height: 48px;
  margin-top: 2px;
  border: 0;
  border-radius: 14px;
  background: var(--seba-accent);
  color: var(--seba-accent-contrast);
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 160ms ease, transform 120ms ease, box-shadow 160ms ease;
}
.continue:hover:not(:disabled) { background: var(--seba-accent-deep); }
.continue:active:not(:disabled) { transform: scale(0.99); }
.continue:focus-visible {
  outline: none;
  box-shadow: 0 0 0 4px var(--seba-ring);
}
.continue:disabled { opacity: 0.55; cursor: progress; }

.notice {
  margin: 4px 0 0;
  padding: 10px 12px;
  border: 1px solid #fecaca;
  border-radius: 10px;
  background: #fef2f2;
  color: #b42318;
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.45;
}
:host([theme="dark"]) .notice {
  border-color: #5b2626;
  background: #2a1515;
  color: #fca5a5;
}
@media (prefers-color-scheme: dark) {
  :host(:not([theme="light"]):not([theme="dark"])) .notice {
    border-color: #5b2626;
    background: #2a1515;
    color: #fca5a5;
  }
}

.trust {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 16px 0 0;
  color: var(--seba-muted);
  font-size: 0.75rem;
  line-height: 1.45;
  text-align: center;
}
.trust svg { flex: none; width: 13px; height: 13px; }

/* ---------- Signed-in state ---------- */
.signed-in { padding: 4px 0 2px; }
.account-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.account-mark {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 13px;
  background: var(--seba-tile);
  color: var(--seba-accent);
}
.account-mark svg { width: 22px; height: 22px; }
.eyebrow {
  margin: 0 0 1px;
  color: var(--seba-muted);
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}
.account-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 650;
  line-height: 1.3;
  letter-spacing: -0.015em;
}
.account-webid {
  margin: 0 0 18px;
  padding: 12px 14px;
  overflow-wrap: anywhere;
  border: 1px solid var(--seba-border);
  border-radius: 12px;
  background: var(--seba-hover);
  color: var(--seba-text);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.5;
}
.signout {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--seba-border);
  border-radius: 12px;
  background: var(--seba-surface);
  color: var(--seba-text);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color 160ms ease, border-color 160ms ease;
}
.signout:hover { border-color: var(--seba-border-strong); background: var(--seba-hover); }
.signout:disabled { opacity: 0.55; cursor: progress; }

/* ---------- Dialog ---------- */
.overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: rgba(14, 12, 20, 0.5);
  -webkit-backdrop-filter: blur(10px) saturate(0.9);
  backdrop-filter: blur(10px) saturate(0.9);
  animation: seba-fade 180ms ease-out;
}
.dialog {
  width: min(23rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);
  padding: 20px;
  overflow: auto;
  border: 1px solid var(--seba-border);
  border-radius: 20px;
  background: var(--seba-surface);
  color: var(--seba-text);
  box-shadow: 0 32px 80px -24px rgba(10, 8, 20, 0.55);
  animation: seba-pop 220ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.dhead {
  display: flex;
  align-items: center;
  gap: 4px;
}
.dhead h2 {
  flex: 1;
  margin: 0;
  font-size: 1.0625rem;
  font-weight: 650;
  line-height: 1.35;
  letter-spacing: -0.015em;
}
.dialog-back,
.dialog-close {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--seba-muted);
  font: inherit;
  font-size: 0.9375rem;
  cursor: pointer;
  transition: background-color 160ms ease, color 160ms ease;
}
.dialog-back { margin-inline-start: -6px; }
.dialog-close { margin-inline-end: -6px; }
.dialog-back:hover,
.dialog-close:hover { background: var(--seba-hover); color: var(--seba-text); }
.dsub {
  margin: 4px 0 16px;
  color: var(--seba-muted);
  font-size: 0.8125rem;
  line-height: 1.5;
}
.dbody {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.choice {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 56px;
  padding: 8px 10px;
  border: 1px solid var(--seba-border);
  border-radius: 12px;
  background: var(--seba-surface);
  color: var(--seba-text);
  font: inherit;
  text-align: start;
  text-decoration: none;
  cursor: pointer;
  transition: border-color 160ms ease, background-color 160ms ease;
}
.choice:hover { border-color: var(--seba-border-strong); background: var(--seba-hover); }
.choice:disabled { opacity: 0.55; cursor: progress; }
.choice-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  overflow: hidden;
  border-radius: 9px;
  background: var(--seba-tile);
  color: var(--seba-accent);
  object-fit: contain;
}
.choice-icon.glyph svg { width: 18px; height: 18px; }
.choice-meta {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}
.choice-title {
  font-size: 0.875rem;
  font-weight: 600;
  line-height: 1.4;
}
.choice-sub {
  overflow: hidden;
  color: var(--seba-muted);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.45;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  flex: none;
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--seba-tile);
  color: var(--seba-link);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.dfoot {
  margin: 14px 0 0;
  color: var(--seba-muted);
  font-size: 0.75rem;
  text-align: center;
}
.dfoot a { color: var(--seba-link); text-underline-offset: 2px; }
.empty {
  margin: 0;
  padding: 14px;
  border-radius: 12px;
  background: var(--seba-hover);
  color: var(--seba-muted);
  font-size: 0.8125rem;
  text-align: center;
}

@keyframes seba-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes seba-pop {
  from { opacity: 0; transform: translateY(8px) scale(0.985); }
  to { opacity: 1; transform: none; }
}
@keyframes seba-sheet {
  from { opacity: 0.6; transform: translateY(18px); }
  to { opacity: 1; transform: none; }
}

@media (max-width: 480px) {
  .overlay {
    align-items: flex-end;
    padding: 0;
  }
  .dialog {
    width: 100%;
    max-height: 88vh;
    max-height: 88dvh;
    padding: 20px 20px calc(20px + env(safe-area-inset-bottom));
    border-radius: 20px 20px 0 0;
    animation: seba-sheet 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
  }
}
@media (max-width: 420px) {
  :host { width: 100%; }
  .card { padding: 22px 18px 20px; border-radius: 20px; }
  .title { font-size: 1.25rem; }
}
@media (prefers-reduced-motion: reduce) {
  .overlay,
  .dialog {
    animation: none;
  }
  .provider,
  .chev,
  .more,
  .create-open,
  .combo,
  .continue,
  .signout,
  .dialog-back,
  .dialog-close,
  .choice {
    transition: none;
  }
  .continue:active:not(:disabled) { transform: none; }
  .provider:hover .chev { transform: none; }
}
@media (forced-colors: active) {
  .card,
  .provider,
  .combo,
  .choice,
  .dialog,
  .signout,
  .account-webid {
    border: 1px solid CanvasText;
  }
  .provider-hit:focus-visible,
  .more:focus-visible,
  .create-open:focus-visible,
  .signout:focus-visible,
  .choice:focus-visible,
  .continue:focus-visible {
    outline: 2px solid Highlight;
  }
}
`;
