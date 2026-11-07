/**
 * `<seba-login>`: a zero-dependency sign-in button custom element.
 *
 * Call {@link defineSebaLogin} once (or import the React wrapper, which registers it)
 * before using the tag. Behaviour is opt-in: importing the package has no side effect.
 */

import { isSebaLogoVariant, sebaLogoImage } from "./assets/icons.js";
import { SebaConfigError, SebaSessionExpiredError } from "./core/errors.js";
import { Seba } from "./seba.js";
import type { LoginOptions, Session, SessionChangeEvent } from "./types.js";

const HTMLElementBase: typeof HTMLElement =
  typeof HTMLElement === "undefined" ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

const OBSERVED_ATTRIBUTES = [
  "client-id",
  "redirect-uri",
  "issuer",
  "issuer-url",
  "providers",
  "web-id",
  "config",
  "label",
  "theme",
  "logo",
  "account",
  "get-a-pod",
] as const;

const STYLES = `
:host {
  display: inline-block;
  --seba-accent: #7c4dff;
  --seba-accent-contrast: #ffffff;
  --seba-surface: #ffffff;
  --seba-text: #1b1b1f;
  --seba-border: color-mix(in srgb, var(--seba-accent) 35%, transparent);
  font: 500 14px/1.25 system-ui, -apple-system, "Segoe UI", sans-serif;
}
:host([theme="dark"]) {
  --seba-surface: #14121a;
  --seba-text: #f5f3ff;
  --seba-border: rgba(255, 255, 255, 0.3);
}
.bar {
  display: inline-flex;
  align-items: stretch;
  gap: 0.4em;
}
select {
  max-width: 12em;
  padding: 0.5em 0.6em;
  border: 1px solid var(--seba-border);
  border-radius: 0.65em;
  background: var(--seba-surface);
  color: var(--seba-text);
  font: inherit;
}
select:focus-visible { outline: 2px solid var(--seba-accent); outline-offset: 2px; }
button {
  display: inline-flex;
  align-items: center;
  gap: 0.55em;
  padding: 0.62em 1em;
  border: 1px solid var(--seba-border);
  border-radius: 0.65em;
  background: var(--seba-surface);
  color: var(--seba-text);
  font: inherit;
  cursor: pointer;
  transition: background-color 120ms ease, border-color 120ms ease, opacity 120ms ease;
}
button:hover:not(:disabled) { border-color: var(--seba-accent); }
button:focus-visible { outline: 2px solid var(--seba-accent); outline-offset: 2px; }
button:disabled { opacity: 0.6; cursor: progress; }
button[data-state="authenticated"] { background: var(--seba-accent); color: var(--seba-accent-contrast); border-color: transparent; }
.logo { display: block; width: 1.35em; height: 1.35em; object-fit: contain; }
.choices {
  display: flex;
  flex-direction: column;
  gap: 0.4em;
  margin-top: 0.5em;
  width: 100%;
}
.chip { width: 100%; justify-content: center; }
.choices[hidden], .other[hidden], .get-a-pod[hidden], .hint[hidden] { display: none; }
.chip { padding: 0.5em 0.8em; font-size: 0.95em; }
.chip[data-last="true"] { border-color: var(--seba-accent); box-shadow: 0 0 0 2px color-mix(in srgb, var(--seba-accent) 25%, transparent); }
.other { display: inline-flex; gap: 0.35em; margin-top: 0.35em; align-items: center; }
.other input {
  flex: 1 1 16em;
  padding: 0.5em 0.6em;
  border: 1px solid var(--seba-border);
  border-radius: 0.65em;
  background: var(--seba-surface);
  color: var(--seba-text);
  font: inherit;
}
.other input:focus-visible { outline: 2px solid var(--seba-accent); outline-offset: 2px; }
.hint { display: block; font-size: 0.78em; opacity: 0.75; margin-top: 0.3em; min-height: 1em; }
.get-a-pod { display: block; margin-top: 0.45em; font-size: 0.85em; color: var(--seba-accent); }
`;
export class SebaLoginElement extends HTMLElementBase {
  static get observedAttributes(): string[] {
    return [...OBSERVED_ATTRIBUTES];
  }

  #seba: Seba | null = null;
  #session: Session | null = null;
  #unsubscribe: (() => void) | null = null;
  #busy = false;
  #restoreStarted = false;

  /** Current session, or `null` when signed out. */
  get session(): Session | null {
    return this.#session;
  }

  connectedCallback(): void {
    this.#render();
    this.shadowRoot?.querySelector("button")?.addEventListener("click", this.#onClick);
    void this.#restoreOrComplete();
  }

  disconnectedCallback(): void {
    this.shadowRoot?.querySelector("button")?.removeEventListener("click", this.#onClick);
  }

  attributeChangedCallback(name: string, _oldValue: string | null, _newValue: string | null): void {
    if (
      name === "client-id" ||
      name === "redirect-uri" ||
      name === "account" ||
      name === "config"
    ) {
      this.#resetClient();
      if (typeof this.isConnected === "boolean" && this.isConnected) {
        void this.#restoreOrComplete();
      }
    }
    this.#update();
  }

  /** Start (or finish) a login with the configured identity hints. */
  async login(options: LoginOptions = {}): Promise<Session | null> {
    const seba = this.#client();
    if (seba === null || this.#busy) {
      return null;
    }
    this.#busy = true;
    this.#update();
    try {
      return await seba.login({ ...this.#identity(), ...options });
    } catch (error) {
      this.#fail(error);
      return null;
    } finally {
      this.#busy = false;
      this.#update();
    }
  }

  /** Sign out and clear the stored session. */
  async logout(): Promise<void> {
    const seba = this.#client();
    if (seba === null || this.#busy) {
      return;
    }
    this.#busy = true;
    this.#update();
    try {
      await seba.logout();
    } catch (error) {
      this.#fail(error);
    } finally {
      this.#busy = false;
      this.#update();
    }
  }

  #attr(name: string): string | null {
    return typeof this.getAttribute === "function" ? this.getAttribute(name) : null;
  }

  #onClick = (): void => {
    if (this.#session !== null) {
      void this.logout();
      return;
    }
    const providers = this.#providers();
    const fixedIssuer = this.#attr("issuer") ?? this.#attr("issuer-url");
    const institutional = providers.length === 1 && fixedIssuer === null && this.#attr("web-id") === null;
    void this.login(institutional ? { issuer: providers[0]! } : {});
  };

  #client(): Seba | null {
    if (this.#seba !== null) {
      return this.#seba;
    }
    const clientId = this.#attr("client-id");
    if (clientId === null) {
      this.#fail(new SebaConfigError("<seba-login> requires a client-id attribute."));
      return null;
    }
    const redirectUri = this.#attr("redirect-uri") ?? currentPageUrl();
    if (redirectUri === null) {
      this.#fail(
        new SebaConfigError(
          "<seba-login> needs a redirect-uri attribute outside a browser document.",
        ),
      );
      return null;
    }
    const account = this.#attr("account");
    let extra: Partial<ConstructorParameters<typeof Seba>[0]> = {};
    const configAttr = this.#attr("config");
    if (configAttr !== null && configAttr.trim() !== "") {
      const parsed = parseInlineConfig(configAttr);
      if ("error" in parsed) {
        this.#fail(new SebaConfigError(`Invalid <seba-login> "config" attribute: ${parsed.error}`));
        return null;
      }
      extra = parsed.config;
    }
    const seba = new Seba({
      ...extra,
      ...(account === null ? {} : { account }),
      clientId,
      redirectUri,
    });
    this.#seba = seba;
    this.#unsubscribe = seba.onSessionChange((event) => {
      this.#onSessionChange(event);
    });
    return seba;
  }

  #resetClient(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#seba = null;
    this.#session = null;
    this.#restoreStarted = false;
    this.#update();
  }

  #onSessionChange(event: SessionChangeEvent): void {
    this.#session = event.session;
    this.#update();
    if (event.reason === "expired") {
      this.#emit("seba:session-expired", null);
    } else if (event.reason !== "logout") {
      this.#emit(`seba:${event.reason}`, event.session);
      if (event.reason === "login") {
        // Compatibility alias used by SolidOS' <solid-ui-login-button>.
        this.#emit("login-success", event.session);
        rememberLastIssuer(event.session?.provider ?? null);
      }
    } else {
      this.#emit("seba:logout", null);
    }
  }

  /** Complete a callback URL, or resume the stored session on a normal page load. */
  async #restoreOrComplete(): Promise<void> {
    if (this.#restoreStarted) {
      return;
    }
    if (this.#attr("client-id") === null) {
      return;
    }
    this.#restoreStarted = true;
    const seba = this.#client();
    if (seba === null) {
      return;
    }
    try {
      if (Seba.isCallbackResponse()) {
        await seba.completeLogin();
        return;
      }
      await seba.restoreSession();
    } catch (error) {
      // An expired stored session is expected: `seba:session-expired` already fired.
      if (!(error instanceof SebaSessionExpiredError)) {
        this.#fail(error);
      }
    }
  }

  #wire(): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    root.querySelector("button")?.addEventListener("click", this.#onClick);
    const hint = root.querySelector<HTMLElement>(".hint");
    const choices = root.querySelector<HTMLElement>(".choices");
    choices?.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.classList.contains("other-toggle")) {
        const other = root.querySelector<HTMLElement>(".other");
        if (other) {
          other.hidden = !other.hidden;
          if (!other.hidden) {
            other.querySelector("input")?.focus();
          }
        }
        return;
      }
      if (target.classList.contains("chip")) {
        const issuer = (target as HTMLElement).dataset.issuer;
        if (issuer) {
          void this.login({ issuer });
        }
      }
    });
    choices?.addEventListener("mouseover", (event) => {
      const card = event.target as HTMLElement;
      if (card.dataset?.issuer === undefined) return;
      if (hint) {
        hint.hidden = false;
        hint.textContent = card.dataset.issuer ?? "";
      }
    });
    choices?.addEventListener("focusin", (event) => {
      const card = event.target as HTMLElement;
      if (card.dataset?.issuer === undefined) return;
      if (hint) {
        hint.hidden = false;
        hint.textContent = card.dataset.issuer ?? "";
      }
    });
    root.querySelector("button.go")?.addEventListener("click", () => {
      void this.#webIdLogin();
    });
    root.querySelector("input.webid")?.addEventListener("keydown", (event) => {
      if ((event as KeyboardEvent).key === "Enter") {
        event.preventDefault();
        void this.#webIdLogin();
      }
    });
  }

  async #webIdLogin(): Promise<void> {
    const input = this.shadowRoot?.querySelector<HTMLInputElement>("input.webid");
    const value = input?.value.trim() ?? "";
    if (value === "") {
      return;
    }
    await this.login({ webId: value });
  }

  #identity(): LoginOptions {
    const select = this.shadowRoot?.querySelector<HTMLSelectElement>(".issuer");
    const chosen = select !== null && select !== undefined && !select.hidden ? select.value : "";
    const issuer =
      this.#attr("issuer") ?? this.#attr("issuer-url") ?? (chosen === "" ? null : chosen);
    const webId = this.#attr("web-id");
    return {
      ...(issuer === null ? {} : { issuer }),
      ...(webId === null ? {} : { webId }),
    };
  }

  #providers(): string[] {
    const raw = this.#attr("providers");
    return raw === null ? [] : parseProviders(raw);
  }

  #render(): void {
    if (typeof this.attachShadow !== "function") {
      return;
    }
    const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
    if (root.childNodes.length > 0) {
      return;
    }
    root.innerHTML =
      `<style>${STYLES}</style>` +
      `<div class="bar">` +
      `<select class="issuer" part="issuer" aria-label="Identity provider" hidden></select>` +
      `<button part="button" type="button">` +
      `<img class="logo" part="logo" alt="" width="48" height="48" decoding="async">` +
      `<span class="label" part="label"></span>` +
      `</button>` +
      `</div>` +
      `<div class="choices" part="choices" hidden></div>` +
      `<div class="other" part="other" hidden>` +
      `<input class="webid" type="url" aria-label="WebID or identity provider URL" placeholder="https://you.example/profile/card#me">` +
      `<button class="go" part="chip" type="button">Continue</button>` +
      `</div>` +
      `<div class="hint" part="hint" hidden></div>` +
      `<a class="get-a-pod" part="get-a-pod" target="_blank" rel="noreferrer noopener" hidden>` +
      `New to Solid? Get a Pod</a>`;
    this.#wire();
    this.#update();
  }

  #update(): void {
    const root = this.shadowRoot;
    const button = root?.querySelector("button");
    if (!button) {
      return;
    }
    const authenticated = this.#session !== null;
    // While provider chips are shown they are the sign-in UI; the plain bar
    // (and its generic button) only returns once signed in ("Sign out") or
    // when there is no chip row at all.
    const bar = this.#barVisible();
    if (bar !== null) {
      bar.hidden = this.#chipsActive();
    }
    button.dataset.state = authenticated ? "authenticated" : "anonymous";
    button.disabled = this.#busy;
    button.setAttribute("aria-busy", this.#busy ? "true" : "false");
    button.setAttribute("aria-pressed", authenticated ? "true" : "false");

    const label = root?.querySelector(".label");
    if (label) {
      const providers = this.#providers();
      const fixedIssuer = this.#attr("issuer") ?? this.#attr("issuer-url");
      if (providers.length === 1 && fixedIssuer === null && this.#attr("web-id") === null && !authenticated) {
        label.textContent = `Sign in with ${providerLabel(providers[0]!)}`;
      } else {
        label.textContent = authenticated ? "Sign out" : (this.#attr("label") ?? "Sign in with Solid");
      }
    }

    this.#updateProviders();
    this.#updateChoices();

    const link = root?.querySelector<HTMLAnchorElement>("a.get-a-pod");
    if (link) {
      const url = this.#attr("get-a-pod");
      if (url === null || authenticated) {
        link.setAttribute("hidden", "");
      } else {
        link.removeAttribute("hidden");
        if (link.getAttribute("href") !== url) {
          link.href = url;
        }
      }
    }

    const logo = root?.querySelector<HTMLImageElement>(".logo");
    if (logo) {
      const requested = this.#attr("logo");
      if (requested === "none") {
        logo.setAttribute("hidden", "");
      } else {
        logo.removeAttribute("hidden");
        const variant = requested !== null && isSebaLogoVariant(requested) ? requested : this.#defaultVariant();
        logo.src = sebaLogoImage(variant);
        logo.alt = "";
      }
    }
  }

  /**
   * Legacy fallback for more providers than the chips can hold (> 6). The chips
   * render 2..6 providers, so the select only appears past that.
   */
  #updateProviders(): void {
    const select = this.shadowRoot?.querySelector<HTMLSelectElement>(".issuer");
    if (!select) {
      return;
    }
    const providers = this.#providers();
    const fixedIssuer = this.#attr("issuer") ?? this.#attr("issuer-url");
    if (providers.length <= 6 || this.#session !== null || fixedIssuer !== null) {
      select.hidden = true;
      return;
    }
    select.hidden = false;
    const previous = select.value;
    const options = providers.map((provider) => {
      const option = document.createElement("option");
      option.value = provider;
      option.textContent = provider.replace(/^https?:\/\//, "").replace(/\/$/, "");
      return option;
    });
    select.replaceChildren(...options);
    if (providers.includes(previous)) {
      select.value = previous;
    }
  }

  /** The plain bar (legacy select + main button). */
  #barVisible(): HTMLElement | null {
    return this.shadowRoot?.querySelector<HTMLElement>(".bar") ?? null;
  }

  /** True while the chip row (not the plain bar) is the sign-in UI. */
  #chipsActive(): boolean {
    const providers = this.#providers();
    const fixedIssuer = this.#attr("issuer") ?? this.#attr("issuer-url");
    return (
      providers.length >= 2 &&
      providers.length <= 6 &&
      this.#session === null &&
      fixedIssuer === null &&
      this.#attr("web-id") === null
    );
  }

  #updateChoices(): void {
    const root = this.shadowRoot;
    const choices = root?.querySelector<HTMLElement>(".choices");
    if (!choices) {
      return;
    }
    // 0 or 1: the main button already covers it (plain prompt / direct issuer).
    // >= 2: render friendly chips. The legacy select stays available for > 6.
    if (!this.#chipsActive()) {
      choices.hidden = true;
      choices.replaceChildren();
      this.#hideHint();
      return;
    }
    choices.hidden = false;
    const providers = this.#providers();
    const last = lastIssuer();
    const ordered = [...providers].sort((a, b) => {
      if (a === last) return -1;
      if (b === last) return 1;
      return 0;
    });
    const fragment = document.createDocumentFragment();
    for (const issuer of ordered) {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.type = "button";
      chip.part = "chip";
      chip.dataset.issuer = issuer;
      chip.textContent = providerLabel(issuer);
      chip.title = issuer;
      if (issuer === last) {
        chip.dataset.last = "true";
        const badge = document.createElement("small");
        badge.textContent = " · last used";
        chip.appendChild(badge);
      }
      fragment.appendChild(chip);
    }
    const other = document.createElement("button");
    other.className = "chip other-toggle";
    other.type = "button";
    other.part = "chip";
    other.textContent = "Other…";
    fragment.appendChild(other);
    choices.replaceChildren(fragment);
    this.#showHintFor(last);
  }

  #showHintFor(issuer: string | null): void {
    const hint = this.shadowRoot?.querySelector<HTMLElement>(".hint");
    if (!hint) {
      return;
    }
    if (issuer === null || issuer === undefined) {
      hint.hidden = true;
      hint.textContent = "";
      return;
    }
    hint.hidden = false;
    hint.textContent = `Signs you in at ${issuer}`;
  }

  #hideHint(): void {
    this.#showHintFor(null);
  }

  #defaultVariant(): "primary" | "inverse" {
    const theme = this.#attr("theme");
    if (theme === "dark") {
      return "inverse";
    }
    if (theme === null || theme === "auto") {
      return typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches
        ? "inverse"
        : "primary";
    }
    return "primary";
  }

  #emit(type: string, session: Session | null): void {
    if (typeof this.dispatchEvent !== "function") {
      return;
    }
    this.dispatchEvent(new CustomEvent(type, { detail: { session }, bubbles: true, composed: true }));
  }

  #fail(error: unknown): void {
    if (typeof this.dispatchEvent !== "function") {
      return;
    }
    this.dispatchEvent(new CustomEvent("seba:error", { detail: { error }, bubbles: true, composed: true }));
  }
}

/** Current document URL without its fragment, used when `redirect-uri` is omitted. */
function currentPageUrl(): string | null {
  if (typeof window === "undefined" || window.location === undefined) {
    return null;
  }
  const url = new URL(window.location.href);
  url.hash = "";
  return url.href;
}

/**
 * Parse a comma/space separated `providers` attribute into absolute HTTP(S) issuers.
 *
 * Invalid entries are dropped rather than breaking the whole element.
 */
export function parseProviders(value: string): string[] {
  const seen = new Set<string>();
  for (const candidate of value.split(/[\s,]+/)) {
    if (candidate === "") {
      continue;
    }
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" || url.protocol === "http:") {
        seen.add(url.href);
      }
    } catch {
      // Not a URL: ignore so one typo cannot disable the whole picker.
    }
  }
  return [...seen];
}

/** Well-known issuers -> people-readable names (the chip text). Unknown issuers fall back to their host. */
const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  "https://solidcommunity.net": "Solid Community",
  "https://solidcommunity.au": "Solid Community AU",
  "https://login.inrupt.com": "Inrupt Pod Spaces",
  "https://pod.inrupt.com": "Inrupt Pod Spaces",
  "https://inrupt.net": "Inrupt (legacy)",
  "https://trinpod.eu": "TrinPod",
  "https://trinpod.us": "TrinPod USA",
  "https://solidweb.org": "Solid Web",
  "https://solidweb.me": "Me is Data",
  "https://teamid.live": "TeamID",
  "https://use.id": "Use.id",
  "https://datapod.igrant.io": "Data Pod",
  "https://solid.redpencil.io": "Redpencil",
};

/** Friendly chip label for a provider issuer: curated name when known, host otherwise. */
export function providerLabel(issuer: string): string {
  let host: string;
  try {
    host = new URL(issuer).host.replace(/^www\./, "");
  } catch {
    host = issuer;
  }
  const curated = PROVIDER_LABELS[issuer.replace(/\/+$/, "")];
  return curated ?? host;
}

const LAST_ISSUER_KEY = "seba:last-issuer";

/** Persist the issuer that most recently completed a login (browser-only). */
function rememberLastIssuer(issuer: string | null): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  try {
    if (issuer === null || issuer === "") {
      localStorage.removeItem(LAST_ISSUER_KEY);
    } else {
      localStorage.setItem(LAST_ISSUER_KEY, issuer);
    }
  } catch {
    // Storage can be unavailable (private mode): the last-used hint is optional.
  }
}

/** The issuer remembered by {@link rememberLastIssuer}, or `null` (browser-only). */
export function lastIssuer(): string | null {
  if (typeof localStorage === "undefined") {
    return null;
  }
  try {
    const value = localStorage.getItem(LAST_ISSUER_KEY);
    if (value === null || value === "") {
      return null;
    }
    return new URL(value).href;
  } catch {
    return null;
  }
}

/** Inline `config` attribute value -> SebaConfig overlay (or a reason string). */
export function parseInlineConfig(
  value: string,
): { config: Partial<ConstructorParameters<typeof Seba>[0]> } | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return { error: "value is not valid JSON." };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { error: "value must be a JSON object." };
  }
  return { config: parsed as Partial<ConstructorParameters<typeof Seba>[0]> };
}

/**
 * Register `<seba-login>` in the current document.
 *
 * @returns `true` when the element is registered, `false` outside a browser or when
 *   another element already owns the tag name.
 */
export function defineSebaLogin(tagName = "seba-login"): boolean {
  if (typeof customElements === "undefined") {
    return false;
  }
  if (customElements.get(tagName) !== undefined) {
    return true;
  }
  customElements.define(tagName, SebaLoginElement);
  return true;
}
