/**
 * Styles for the `<seba-login>` card and its option dialogs.
 *
 * Kept as a string so the element stays a single shadow root with no runtime
 * style injection or external CSS dependency.
 *
 * Design language — "quiet monochrome": a dark, near-black surface, fully
 * rounded (pill) provider buttons with hairline borders, a slightly darker
 * WebID field, and a single high-contrast primary action. The palette is
 * expressed entirely through custom properties so a host page can retheme the
 * card without touching the element. Light mode is a deliberate inverse so a
 * site owner who opts out of dark gets the same structure with flipped tones.
 */

export const CARD_STYLES = `
:host {
  --seba-bg: #0b0b0c;
  --seba-surface: #141415;
  --seba-surface-2: #1c1c1e;
  --seba-raised: #1a1a1c;
  --seba-btn: #1c1c1e;
  --seba-btn-border: #333336;
  --seba-btn-hover: #242427;
  --seba-field: #0a0a0b;
  --seba-accent: #8b5cf6;
  --seba-cta: #7c3aed;
  --seba-cta-text: #ffffff;
  --seba-cta-hover: #6d28d9;
  --seba-text: #fafafa;
  --seba-text-2: #b6b6bb;
  --seba-muted: #86868c;
  --seba-border: #2c2c2e;
  --seba-border-strong: #444447;
  --seba-ring: rgba(139, 92, 246, 0.45);
  --seba-link: #c4b5fd;
  --seba-tile: #1a1a1c;
  --seba-hover: #1e1e20;
  --seba-danger: #fca5a5;
  --seba-danger-bg: #251313;
  --seba-danger-border: #552727;
  --seba-shadow: 0 1px 2px rgba(0, 0, 0, 0.4), 0 32px 72px -32px rgba(0, 0, 0, 0.85);
  --seba-radius: 20px;
  --seba-pill: 9999px;
  --seba-radius-control: 14px;
  --seba-font: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  --seba-transition: 160ms ease;
  --seba-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --seba-ease-snap: cubic-bezier(0.16, 1, 0.3, 1);
  --seba-dur: 180ms;
  --seba-dur-slow: 260ms;

  display: block;
  width: min(25rem, 100%);
  margin-inline: auto;
  color-scheme: dark;
  color: var(--seba-text);
  font-family: var(--seba-font);
  font-size: 15px;
  font-weight: 400;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* ---------- Light variant (host opts in with theme="light") ---------- */
:host([theme="light"]) {
  color-scheme: light;
  --seba-bg: #f4f4f6;
  --seba-surface: #ffffff;
  --seba-surface-2: #ffffff;
  --seba-raised: #ffffff;
  --seba-btn: #f6f6f8;
  --seba-btn-border: #e2e2e6;
  --seba-btn-hover: #ededf0;
  --seba-field: #ffffff;
  --seba-accent: #6d28d9;
  --seba-cta: #6d28d9;
  --seba-cta-text: #ffffff;
  --seba-cta-hover: #5b21b6;
  --seba-text: #0a0a0a;
  --seba-text-2: #3f3f46;
  --seba-muted: #6b6b72;
  --seba-border: #e2e2e6;
  --seba-border-strong: #c9c9cf;
  --seba-ring: rgba(109, 40, 217, 0.3);
  --seba-link: #5b21b6;
  --seba-tile: #f2f2f5;
  --seba-hover: #f2f2f5;
  --seba-danger: #b42318;
  --seba-danger-bg: #fef2f2;
  --seba-danger-border: #fecaca;
  --seba-shadow: 0 1px 2px rgba(16, 16, 24, 0.05), 0 28px 64px -32px rgba(16, 16, 24, 0.28);
}

/* ---------- Follow the OS when the host has not chosen ---------- */
@media (prefers-color-scheme: light) {
  :host(:not([theme="dark"]):not([theme="light"])) {
    color-scheme: light;
    --seba-bg: #f4f4f6;
    --seba-surface: #ffffff;
    --seba-surface-2: #ffffff;
    --seba-raised: #ffffff;
    --seba-btn: #f6f6f8;
    --seba-btn-border: #e2e2e6;
    --seba-btn-hover: #ededf0;
    --seba-field: #ffffff;
    --seba-accent: #6d28d9;
    --seba-cta: #6d28d9;
    --seba-cta-text: #ffffff;
    --seba-cta-hover: #5b21b6;
    --seba-text: #0a0a0a;
    --seba-text-2: #3f3f46;
    --seba-muted: #6b6b72;
    --seba-border: #e2e2e6;
    --seba-border-strong: #c9c9cf;
    --seba-ring: rgba(109, 40, 217, 0.3);
    --seba-link: #5b21b6;
    --seba-tile: #f2f2f5;
    --seba-hover: #f2f2f5;
    --seba-danger: #b42318;
    --seba-danger-bg: #fef2f2;
    --seba-danger-border: #fecaca;
    --seba-shadow: 0 1px 2px rgba(16, 16, 24, 0.05), 0 28px 64px -32px rgba(16, 16, 24, 0.28);
  }
}

:host([hidden]), [hidden] { display: none !important; }
*, *::before, *::after { box-sizing: border-box; }

/* ---------- Card ---------- */
.card {
  position: relative;
  padding: 22px 20px 18px;
  border: 1px solid var(--seba-border);
  border-radius: var(--seba-radius);
  background: var(--seba-surface);
  box-shadow: var(--seba-shadow);
  animation: seba-card-in 300ms var(--seba-ease) both;
}
@keyframes seba-card-in {
  from { opacity: 0; translate: 0 12px; scale: 0.985; }
  to { opacity: 1; translate: 0 0; scale: 1; }
}

/* ---------- Header ---------- */
.head {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
  text-align: start;
}
.head > div {
  min-width: 0;
}
 .brand {
  display: block;
  flex: none;
  width: 46px;
  height: 46px;
  object-fit: contain;
}
.title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02em;
  text-wrap: balance;
}
.sub {
  max-width: 20rem;
  margin: 4px 0 0;
  color: var(--seba-muted);
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.5;
  text-wrap: balance;
}

/* ---------- Provider pill buttons ---------- */
.providers {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.provider {
  position: relative;
  display: flex;
  align-items: center;
  gap: 11px;
  min-height: 46px;
  padding: 6px 15px;
  border: 1px solid var(--seba-btn-border);
  border-radius: var(--seba-radius-control);
  background: var(--seba-btn);
  transition: border-color var(--seba-dur) ease, background-color var(--seba-dur) ease,
    transform var(--seba-dur) var(--seba-ease), box-shadow var(--seba-dur) ease,
    scale 120ms var(--seba-ease);
  animation: seba-row-in var(--seba-dur-slow) var(--seba-ease) both;
}
.provider:nth-child(1) { animation-delay: 40ms; }
.provider:nth-child(2) { animation-delay: 75ms; }
.provider:nth-child(3) { animation-delay: 110ms; }
@keyframes seba-row-in {
  from { opacity: 0; translate: 0 8px; }
  to { opacity: 1; translate: 0 0; }
}
.provider:hover {
  border-color: var(--seba-border-strong);
  background: var(--seba-btn-hover);
  transform: translateY(-1px);
  box-shadow: 0 8px 18px -14px rgba(0, 0, 0, 0.75);
}
.provider:has(.provider-hit:active) {
  scale: 0.985;
  transition-duration: 90ms;
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
  width: 26px;
  height: 26px;
  border-radius: 8px;
  object-fit: contain;
  pointer-events: none;
}
.pmeta {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  align-items: center;
  pointer-events: none;
}
.pname {
  overflow: hidden;
  max-width: 100%;
  font-size: 0.9375rem;
  font-weight: 500;
  line-height: 1.35;
  letter-spacing: -0.005em;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.psite {
  position: relative;
  z-index: 1;
  max-width: 100%;
  overflow: hidden;
  color: var(--seba-muted);
  font-size: 0.6875rem;
  font-weight: 400;
  line-height: 1.4;
  text-align: center;
  text-decoration: none;
  text-overflow: ellipsis;
  white-space: nowrap;
  pointer-events: auto;
}
.psite:hover { color: var(--seba-link); text-decoration: underline; text-underline-offset: 2px; }
.chev {
  flex: none;
  display: inline-flex;
  color: var(--seba-muted);
  opacity: 0.75;
  pointer-events: none;
  transition: transform var(--seba-transition), opacity var(--seba-transition);
}
.chev svg { width: 17px; height: 17px; }
.provider:hover .chev { transform: translateX(2px); opacity: 1; }

/* ---------- More (subtle text link under the providers) ---------- */
.more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: fit-content;
  min-height: 26px;
  margin: 6px auto 0;
  padding: 3px 10px;
  border: 0;
  border-radius: var(--seba-radius-control);
  background: transparent;
  color: var(--seba-muted);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color var(--seba-transition), color var(--seba-transition);
}
.more:hover { background: var(--seba-hover); color: var(--seba-text); }
.more:focus-visible,
.create-open:focus-visible,
.signout:focus-visible,
.dialog-back:focus-visible,
.dialog-close:focus-visible,
.choice:focus-visible,
.prefix-button:focus-visible {
  outline: 2px solid var(--seba-accent);
  outline-offset: 2px;
}
.more-dots {
  font-size: 1.0625rem;
  line-height: 1;
  letter-spacing: 0.04em;
  transform: translateY(-2px);
}
.create {
  margin: 8px 0 0;
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
  gap: 14px;
  margin: 12px 0 10px;
  color: var(--seba-muted);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.or::before,
.or::after {
  content: "";
  flex: 1;
  height: 1px;
  background: var(--seba-border);
}

/* ---------- WebID field (combo) ---------- */
.webid-form {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.field-label {
  color: var(--seba-text);
  font-size: 0.8125rem;
  font-weight: 500;
}
.combo {
  display: flex;
  align-items: stretch;
  min-height: 46px;
  overflow: visible;
  border: 1px solid var(--seba-btn-border);
  border-radius: var(--seba-radius-control);
  background: var(--seba-field);
  transition: border-color var(--seba-transition), box-shadow var(--seba-transition);
}
.combo:focus-within {
  border-color: var(--seba-accent);
  box-shadow: 0 0 0 3px var(--seba-ring);
}
.prefix-wrap {
  position: relative;
  display: flex;
  flex: none;
  align-items: center;
  gap: 8px;
  max-width: 54%;
  padding-inline-start: 12px;
  border-inline-end: 1px solid var(--seba-border);
  border-radius: var(--seba-radius-control) 0 0 var(--seba-radius-control);
  background: var(--seba-hover);
}
.prefix-icon {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  object-fit: contain;
}
.prefix-button {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 9.5rem;
  min-width: 0;
  padding: 12px 12px 12px 0;
  border: 0;
  background: transparent;
  color: var(--seba-text);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  text-align: start;
  cursor: pointer;
}
.prefix-button:focus { outline: none; }
.prefix-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prefix-chev {
  flex: none;
  display: inline-flex;
  color: var(--seba-muted);
  pointer-events: none;
}
.prefix-chev svg { width: 15px; height: 15px; }
.prefix-menu {
  position: absolute;
  bottom: calc(100% + 8px);
  left: -1px;
  z-index: 30;
  width: max(250px, 100%);
  max-width: 330px;
  max-height: min(300px, var(--seba-menu-space, 300px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 6px;
  border: 1px solid var(--seba-border);
  border-radius: var(--seba-radius-control);
  background: var(--seba-raised);
  box-shadow: 0 18px 40px -16px rgba(0, 0, 0, 0.5);
  transform-origin: bottom left;
  animation: seba-menu-in 180ms var(--seba-ease-snap);
}

/* ---------- Scrollbars (WebKit + Firefox) ---------- */
.prefix-list,
.dbody {
  scrollbar-width: thin;
  scrollbar-color: var(--seba-border-strong) transparent;
}
.prefix-list::-webkit-scrollbar,
.dbody::-webkit-scrollbar {
  width: 10px;
}
.prefix-list::-webkit-scrollbar-track,
.dbody::-webkit-scrollbar-track {
  background: transparent;
}
.prefix-list::-webkit-scrollbar-thumb,
.dbody::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: var(--seba-pill);
  background: var(--seba-border-strong);
  background-clip: content-box;
}
.prefix-list::-webkit-scrollbar-thumb:hover,
.dbody::-webkit-scrollbar-thumb:hover {
  background: var(--seba-muted);
  background-clip: content-box;
}
.prefix-list::-webkit-scrollbar-corner,
.dbody::-webkit-scrollbar-corner {
  background: transparent;
}
.prefix-menu.drop-down {
  bottom: auto;
  top: calc(100% + 8px);
  transform-origin: top left;
  animation-name: seba-menu-in-down;
}
@keyframes seba-menu-in {
  from { opacity: 0; translate: 0 6px; scale: 0.97; }
  to { opacity: 1; translate: 0 0; scale: 1; }
}
@keyframes seba-menu-in-down {
  from { opacity: 0; translate: 0 -6px; scale: 0.97; }
  to { opacity: 1; translate: 0 0; scale: 1; }
}
/* ---------- Search filter (long provider lists) ---------- */
.search {
  display: flex;
  align-items: center;
  gap: 9px;
  height: 40px;
  padding: 0 14px;
  border: 1px solid var(--seba-btn-border);
  border-radius: var(--seba-radius-control);
  background: var(--seba-field);
  transition: border-color var(--seba-dur) ease, box-shadow var(--seba-dur) ease,
    background-color var(--seba-dur) ease;
}
.search:focus-within {
  border-color: var(--seba-accent);
  background: var(--seba-surface);
  box-shadow: 0 0 0 3px var(--seba-ring);
}
.search-icon {
  flex: none;
  display: inline-flex;
  color: var(--seba-muted);
  transition: color var(--seba-dur) ease;
}
.search:focus-within .search-icon { color: var(--seba-accent); }
.search-icon svg { width: 16px; height: 16px; }
.search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--seba-text);
  font: inherit;
  font-size: 0.875rem;
}
.search input::placeholder { color: var(--seba-muted); opacity: 0.9; }
.search input:focus { outline: none; }
.search input::-webkit-search-cancel-button {
  -webkit-appearance: none;
  appearance: none;
  flex: none;
  width: 17px;
  height: 17px;
  border-radius: var(--seba-pill);
  background-color: var(--seba-border-strong);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2386868c' stroke-width='2.6' stroke-linecap='round'%3E%3Cpath d='M6 6l12 12M18 6L6 18'/%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
  background-size: 9px 9px;
  cursor: pointer;
  transition: background-color var(--seba-dur) ease;
}
.search input::-webkit-search-cancel-button:hover { background-color: var(--seba-muted); }
.empty,
.empty-search,
.prefix-empty {
  margin: 0;
  padding: 14px 12px;
  color: var(--seba-muted);
  font-size: 0.8125rem;
  line-height: 1.45;
  text-align: center;
}
/* The field stays put; only the list below it scrolls. */
.prefix-menu {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.prefix-menu > .search { flex: none; margin-bottom: 6px; }
.prefix-list {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.prefix-option {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: transparent;
  color: var(--seba-text);
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: background-color var(--seba-transition), border-color var(--seba-transition);
}
.prefix-option:hover,
.prefix-option:focus-visible {
  background: var(--seba-hover);
  outline: none;
}
.prefix-option[aria-selected="true"] {
  border-color: var(--seba-accent);
  background: color-mix(in srgb, var(--seba-accent) 16%, var(--seba-raised));
}
.prefix-option-icon {
  flex: none;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  object-fit: contain;
}
.prefix-option-icon.glyph {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--seba-muted);
}
.prefix-option-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.prefix-option-label {
  overflow: hidden;
  font-size: 0.875rem;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.prefix-option-domain {
  overflow: hidden;
  color: var(--seba-muted);
  font-size: 0.75rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.webid-input {
  flex: 1;
  min-width: 0;
  padding: 12px 12px;
  border: 0;
  background: transparent;
  color: var(--seba-text);
  font: inherit;
  font-size: 0.9375rem;
}
.webid-input::placeholder { color: var(--seba-muted); opacity: 0.9; }
.webid-input:focus { outline: none; }

/* ---------- Primary action ---------- */
.continue {
  min-height: 46px;
  margin-top: 2px;
  border: 0;
  border-radius: var(--seba-pill);
  background: var(--seba-cta);
  color: var(--seba-cta-text);
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  letter-spacing: -0.005em;
  cursor: pointer;
  transition: background-color var(--seba-transition), transform 120ms ease,
    box-shadow var(--seba-transition);
}
.continue:hover:not(:disabled) { background: var(--seba-cta-hover); }
.continue:active:not(:disabled),
.signout:active:not(:disabled),
.more:active,
.create-open:active {
  scale: 0.985;
}
.continue:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--seba-ring);
}
.continue:disabled { opacity: 0.55; cursor: progress; }

/* ---------- Error notice ---------- */
.notice {
  margin: 2px 0 0;
  padding: 11px 14px;
  border: 1px solid var(--seba-danger-border);
  border-radius: 12px;
  background: var(--seba-danger-bg);
  color: var(--seba-danger);
  font-size: 0.8125rem;
  font-weight: 400;
  line-height: 1.45;
}

/* ---------- Trust note ---------- */
.trust {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin: 12px 0 0;
  color: var(--seba-muted);
  font-size: 0.6875rem;
  line-height: 1.45;
  text-align: center;
}
.trust svg { flex: none; width: 13px; height: 13px; }

/* ---------- Signed-in state ---------- */
.signed-in { padding: 2px 0; }
.signed-in:not([hidden]) {
  animation: seba-panel-in 280ms var(--seba-ease);
}
@keyframes seba-panel-in {
  from { opacity: 0; translate: 0 8px; }
  to { opacity: 1; translate: 0 0; }
}
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
  font-weight: 600;
  line-height: 1.3;
  letter-spacing: -0.015em;
}
.account-webid {
  margin: 0 0 18px;
  padding: 13px 15px;
  overflow-wrap: anywhere;
  border: 1px solid var(--seba-border);
  border-radius: 14px;
  background: var(--seba-surface-2);
  color: var(--seba-text);
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  font-size: 0.75rem;
  line-height: 1.5;
}
.signout {
  width: 100%;
  min-height: 50px;
  border: 1px solid var(--seba-btn-border);
  border-radius: var(--seba-radius-control);
  background: var(--seba-btn);
  color: var(--seba-text);
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  transition: background-color var(--seba-transition), border-color var(--seba-transition);
}
.signout:hover { border-color: var(--seba-border-strong); background: var(--seba-btn-hover); }
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
  background: rgba(8, 8, 10, 0.6);
  -webkit-backdrop-filter: blur(12px) saturate(0.9);
  backdrop-filter: blur(12px) saturate(0.9);
  animation: seba-fade 200ms ease-out;
}
.dialog {
  width: min(23rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  max-height: calc(100dvh - 2rem);
  padding: 18px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--seba-border);
  border-radius: var(--seba-radius);
  background: var(--seba-surface);
  color: var(--seba-text);
  box-shadow: 0 36px 88px -28px rgba(0, 0, 0, 0.7);
  animation: seba-dialog-in 320ms var(--seba-ease-snap);
}
.dialog > .search { flex: none; margin-bottom: 10px; }
.dialog > .dhead,
.dialog > .dsub,
.dialog > .dfoot { flex: none; }
@keyframes seba-dialog-in {
  from { opacity: 0; translate: 0 16px; scale: 0.96; }
  to { opacity: 1; translate: 0 0; scale: 1; }
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
  font-weight: 600;
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
  transition: background-color var(--seba-transition), color var(--seba-transition);
}
.dialog-back { margin-inline-start: -6px; }
.dialog-close { margin-inline-end: -6px; }
.dialog-back:hover,
.dialog-close:hover { background: var(--seba-hover); color: var(--seba-text); }
.dsub {
  margin: 4px 0 12px;
  color: var(--seba-muted);
  font-size: 0.8125rem;
  line-height: 1.5;
}
.dbody {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 7px;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.choice {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  min-height: 48px;
  padding: 6px 16px;
  border: 1px solid var(--seba-btn-border);
  border-radius: var(--seba-radius-control);
  background: var(--seba-btn);
  color: var(--seba-text);
  font: inherit;
  text-align: start;
  text-decoration: none;
  cursor: pointer;
  transition: border-color var(--seba-dur) ease, background-color var(--seba-dur) ease,
    transform var(--seba-dur) var(--seba-ease), scale 120ms var(--seba-ease);
  animation: seba-choice-in var(--seba-dur-slow) var(--seba-ease) both;
}
.dialog .choice:nth-child(1) { animation-delay: 20ms; }
.dialog .choice:nth-child(2) { animation-delay: 45ms; }
.dialog .choice:nth-child(3) { animation-delay: 70ms; }
.dialog .choice:nth-child(4) { animation-delay: 95ms; }
.dialog .choice:nth-child(5) { animation-delay: 120ms; }
.dialog .choice:nth-child(n + 6) { animation-delay: 145ms; }
@keyframes seba-choice-in {
  from { opacity: 0; translate: 0 10px; }
  to { opacity: 1; translate: 0 0; }
}
.choice:hover { border-color: var(--seba-border-strong); background: var(--seba-btn-hover); }
.choice:active:not(:disabled) { scale: 0.985; }
.choice:disabled { opacity: 0.55; cursor: progress; }
.choice-icon {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  overflow: hidden;
  border-radius: 8px;
  background: var(--seba-tile);
  color: var(--seba-text);
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
  line-height: 1.3;
}
.choice-sub {
  overflow: hidden;
  color: var(--seba-muted);
  font-size: 0.75rem;
  font-weight: 400;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dfoot {
  margin: 12px 0 0;
  color: var(--seba-muted);
  font-size: 0.75rem;
  text-align: center;
}
.dfoot a { color: var(--seba-link); text-underline-offset: 2px; }

@keyframes seba-fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes seba-sheet {
  from { opacity: 0.5; translate: 0 28px; }
  to { opacity: 1; translate: 0 0; }
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
    animation: seba-sheet 300ms var(--seba-ease-snap);
  }
}
@media (max-width: 420px) {
  :host { width: 100%; }
  .card { padding: 24px 18px 20px; border-radius: 18px; }
  .title { font-size: 1.3125rem; }
  /* Keep the field usable when the card is only ~290px wide. */
  .prefix-wrap { max-width: 48%; padding-inline-start: 10px; }
  .prefix-button { gap: 6px; padding-right: 8px; }
  .webid-input { padding-inline: 10px; }
}
@media (prefers-reduced-motion: reduce) {
  .card,
  .provider,
  .overlay,
  .dialog,
  .prefix-menu,
  .choice,
  .signed-in:not([hidden]) {
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
  .choice,
  .prefix-option,
  .search {
    transition: none;
  }
  .continue:active:not(:disabled),
  .signout:active:not(:disabled),
  .more:active,
  .create-open:active,
  .choice:active:not(:disabled),
  .provider:has(.provider-hit:active) {
    scale: none;
  }
  .provider:hover {
    transform: none;
    box-shadow: none;
  }
  .provider:hover .chev { transform: none; }
}
@media (forced-colors: active) {
  .card,
  .provider,
  .combo,
  .choice,
  .dialog,
  .signout,
  .account-webid,
  .prefix-menu {
    border: 1px solid CanvasText;
  }
  .provider-hit:focus-visible,
  .more:focus-visible,
  .create-open:focus-visible,
  .signout:focus-visible,
  .choice:focus-visible,
  .prefix-button:focus-visible,
  .continue:focus-visible {
    outline: 2px solid Highlight;
  }
}

`;