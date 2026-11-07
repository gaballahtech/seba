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
  "web-id",
  "config",
  "label",
  "theme",
  "logo",
  "account",
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
    void (this.#session === null ? this.login() : this.logout());
  };

  #client(): Seba | null {
    if (this.#seba !== null) {
      return this.#seba;
    }
    const clientId = this.#attr("client-id");
    const redirectUri = this.#attr("redirect-uri");
    if (clientId === null || redirectUri === null) {
      this.#fail(new SebaConfigError("<seba-login> requires client-id and redirect-uri attributes."));
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
    } else {
      this.#emit("seba:logout", null);
    }
  }

  /** Complete a callback URL, or resume the stored session on a normal page load. */
  async #restoreOrComplete(): Promise<void> {
    if (this.#restoreStarted) {
      return;
    }
    if (this.#attr("client-id") === null || this.#attr("redirect-uri") === null) {
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

  #identity(): LoginOptions {
    const issuer = this.#attr("issuer");
    const webId = this.#attr("web-id");
    return {
      ...(issuer === null ? {} : { issuer }),
      ...(webId === null ? {} : { webId }),
    };
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
      `<button part="button" type="button">` +
      `<img class="logo" part="logo" alt="" width="64" height="64" decoding="async">` +
      `<span class="label" part="label"></span>` +
      `</button>`;
    this.#update();
  }

  #update(): void {
    const root = this.shadowRoot;
    const button = root?.querySelector("button");
    if (!button) {
      return;
    }
    const authenticated = this.#session !== null;
    button.dataset.state = authenticated ? "authenticated" : "anonymous";
    button.disabled = this.#busy;
    button.setAttribute("aria-busy", this.#busy ? "true" : "false");
    button.setAttribute("aria-pressed", authenticated ? "true" : "false");

    const label = root?.querySelector(".label");
    if (label) {
      label.textContent = authenticated ? "Sign out" : (this.#attr("label") ?? "Sign in with Solid");
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
