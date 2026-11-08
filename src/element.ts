/**
 * `<seba-login>`: a zero-dependency, Google-quality sign-in custom element.
 *
 * The compact button opens a polished dialog: a custom provider listbox with
 * brand tiles, an "or" divider, a manual WebID/issuer field with automatic
 * discovery, a sign-up link and full keyboard + ARIA support. Opt-in design:
 * importing the package registers nothing until `defineSebaLogin` is called
 * (or the React wrapper imports it).
 */

import { isSebaLogoVariant, sebaLogoImage } from "./assets/icons.js";
import type { SebaLogoVariant } from "./assets/icons.js";
import { issuerDomain, PROVIDER_INFO, providerInfo } from "./assets/providers.js";
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
  "get-a-pod",
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
  --seba-accent: #7c3aed;
  --seba-accent-deep: #5b21b6;
  --seba-accent-hover: #6d28d9;
  --seba-accent-contrast: #ffffff;
  --seba-surface: #ffffff;
  --seba-raised: #ffffff;
  --seba-text: #1b1b1f;
  --seba-muted: #6b6a75;
  --seba-border: #e4e1ef;
  --seba-tile: #f3effe;
  --seba-hover: #f6f2ff;
  --seba-ring: rgba(124, 58, 237, 0.45);
  --seba-shadow: 0 24px 64px -12px rgba(27, 17, 51, 0.38);
  font: 500 14px/1.3 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--seba-text);
}
:host([theme="dark"]) {
  --seba-surface: #14121a;
  --seba-raised: #1d1928;
  --seba-text: #f5f3ff;
  --seba-muted: #a7a2b8;
  --seba-border: #37304a;
  --seba-tile: #2a2340;
  --seba-hover: #292136;
  --seba-shadow: 0 24px 64px -12px rgba(0, 0, 0, 0.7);
}
:host([hidden]) { display: none !important; }
[hidden] { display: none !important; }

.primary {
  display: inline-flex;
  align-items: center;
  gap: 0.55em;
  padding: 0.72em 1.25em;
  border: none;
  border-radius: 0.8em;
  background: linear-gradient(135deg, var(--seba-accent) 0%, var(--seba-accent-deep) 100%);
  color: #ffffff;
  font: inherit;
  cursor: pointer;
  box-shadow: 0 1px 2px rgba(76, 29, 149, 0.35), 0 8px 24px -8px rgba(124, 58, 237, 0.55);
  transition: filter 130ms ease, transform 130ms ease, box-shadow 130ms ease;
}
.primary:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.primary:active:not(:disabled) { transform: translateY(0); filter: brightness(0.97); }
.primary:focus-visible { outline: 3px solid var(--seba-ring); outline-offset: 2px; }
.primary:disabled { opacity: 0.65; cursor: progress; }
.primary[data-state="authenticated"] {
  background: var(--seba-surface);
  color: var(--seba-text);
  border: 1px solid var(--seba-border);
  box-shadow: none;
}
.logo { display: block; width: 1.3em; height: 1.3em; object-fit: contain; }
.primary[data-state="authenticated"] .logo { background: var(--seba-tile); border-radius: 0.35em; padding: 1px; }

.overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(24, 16, 43, 0.45);
  backdrop-filter: blur(3px);
  animation: seba-fade 150ms ease;
}
.dialog {
  position: relative;
  width: min(25rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  overflow: visible;
  border-radius: 1.1em;
  background: var(--seba-surface);
  color: var(--seba-text);
  box-shadow: var(--seba-shadow);
  padding: 1.4rem 1.4rem 1.1rem;
  animation: seba-pop 160ms cubic-bezier(0.2, 0.9, 0.3, 1.2);
}
.close {
  position: absolute;
  top: 0.7rem;
  inset-inline-end: 0.7rem;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--seba-muted);
  font-size: 1.05rem;
  cursor: pointer;
}
.close:hover { background: var(--seba-hover); color: var(--seba-text); }
.close:focus-visible { outline: 2px solid var(--seba-ring); outline-offset: 1px; }
.dialog h2 { margin: 0 0 0.25rem; font-size: 1.1rem; font-weight: 650; letter-spacing: -0.01em; }
.dialog .sub { margin: 0 0 1rem; font-size: 0.86rem; color: var(--seba-muted); }

.picker { position: relative; }
.trigger {
  display: flex;
  align-items: center;
  gap: 0.65em;
  width: 100%;
  padding: 0.55em 0.7em;
  border: 1px solid var(--seba-border);
  border-radius: 0.75em;
  background: var(--seba-raised);
  color: inherit;
  font: inherit;
  text-align: start;
  cursor: pointer;
  transition: border-color 120ms ease, background-color 120ms ease;
}
.trigger:hover { border-color: var(--seba-accent); }
.trigger[aria-expanded="true"] { border-color: var(--seba-accent); }
.trigger:focus-visible { outline: 2px solid var(--seba-ring); outline-offset: 1px; }
.tile { display: block; width: 1.9em; height: 1.9em; border-radius: 0.55em; object-fit: contain; flex: none; }
.pnames { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.pname { font-weight: 600; font-size: 0.95em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pdomain { font-style: normal; font-size: 0.78em; color: var(--seba-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.chev { flex: none; display: inline-flex; color: var(--seba-muted); transition: transform 130ms ease; }
.chev svg { display: block; width: 1.15em; height: 1.15em; }
.trigger[aria-expanded="true"] .chev { transform: rotate(180deg); }

.menu {
  position: absolute;
  top: calc(100% + 6px);
  inset-inline: 0;
  z-index: 1;
  margin: 0;
  padding: 0.30rem;
  list-style: none;
  max-height: min(12.5rem, 40vh);
  overflow: auto;
  scrollbar-width: none;
  -ms-overflow-style: none;
  background: var(--seba-raised);
  border: 1px solid var(--seba-border);
  border-radius: 0.8em;
  box-shadow: 0 16px 40px -12px rgba(27, 17, 51, 0.45);
  animation: seba-pop 140ms cubic-bezier(0.2, 0.9, 0.3, 1.1);
}
.menu li {
  display: flex;
  align-items: center;
  gap: 0.65em;
  padding: 0.5em 0.6em;
  border-radius: 0.6em;
  cursor: pointer;
}
.menu li:hover, .menu li[data-active="true"] { background: var(--seba-hover); }
.menu li[aria-selected="true"] { background: var(--seba-tile); }
.menu .tile { width: 1.75em; height: 1.75em; }
.menu .ok { margin-inline-start: auto; display: inline-flex; color: var(--seba-accent); visibility: hidden; }
.menu .ok svg { display: block; width: 1.1em; height: 1.1em; }
.menu li[aria-selected="true"] .ok { visibility: visible; }

.or {
  display: flex;
  align-items: center;
  gap: 0.7em;
  margin: 0.95rem 0;
  color: var(--seba-muted);
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--seba-border); }

.manual { display: flex; gap: 0.5em; }
.manual input {
  flex: 1;
  min-width: 0;
  padding: 0.55em 0.7em;
  border: 1px solid var(--seba-border);
  border-radius: 0.7em;
  background: var(--seba-raised);
  color: inherit;
  font: inherit;
}
.manual input::placeholder { color: var(--seba-muted); }
.manual input:focus-visible { outline: 2px solid var(--seba-ring); outline-offset: 1px; border-color: var(--seba-accent); }
.manual .continue {
  flex: none;
  padding: 0.55em 1em;
  border: none;
  border-radius: 0.7em;
  background: linear-gradient(135deg, var(--seba-accent), var(--seba-accent-deep));
  color: #ffffff;
  font: inherit;
  cursor: pointer;
}
.manual .continue:hover:not(:disabled) { filter: brightness(1.08); }
.manual .continue:focus-visible { outline: 3px solid var(--seba-ring); outline-offset: 1px; }
.manual .continue:disabled { opacity: 0.65; cursor: progress; }

.notice {
  margin: 0.7rem 0 0;
  font-size: 0.82rem;
  border-radius: 0.6em;
  padding: 0.55em 0.7em;
  background: #fdeced;
  color: #8a1c2b;
}
:host([theme="dark"]) .notice { background: #3b1d25; color: #ffb4c0; }
.signup { margin: 1rem 0 0; font-size: 0.84rem; color: var(--seba-muted); }
.signup a { color: var(--seba-accent); font-weight: 600; text-decoration: none; }
.signup a:hover { text-decoration: underline; }

@keyframes seba-fade { from { opacity: 0; } }
@keyframes seba-pop { from { opacity: 0; transform: translateY(-6px) scale(0.985); } }
@media (prefers-reduced-motion: reduce) {
  .overlay, .dialog, .menu { animation: none; }
  .primary { transition: none; }
}
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
  #dialogOpen = false;
  #menuOpen = false;
  #activeIndex = -1;
  #errorText = "";
  #selectedIssuer: string | null = null;

  /** Current session, or `null` when signed out. */
  get session(): Session | null {
    return this.#session;
  }

  connectedCallback(): void {
    this.#render();
    this.shadowRoot?.querySelector(".primary")?.addEventListener("click", this.#onPrimary);
    this.shadowRoot?.querySelector(".close")?.addEventListener("click", this.#closeDialog);
    this.shadowRoot?.querySelector(".trigger")?.addEventListener("click", this.#toggleMenu);
    this.shadowRoot?.querySelector(".menu")?.addEventListener("click", this.#onMenuClick);
    this.shadowRoot?.querySelector(".menu")?.addEventListener("keydown", this.#onMenuKeydown);
    this.shadowRoot?.querySelector(".manual")?.addEventListener("submit", this.#onManualSubmit);
    this.shadowRoot?.querySelectorAll(".overlay, .dialog")?.forEach((el) => {
      el.addEventListener("keydown", this.#trapTab);
    });
    this.shadowRoot?.querySelector(".overlay")?.addEventListener("click", this.#onOverlayClick);
    void this.#restoreOrComplete();
  }

  disconnectedCallback(): void {
    this.shadowRoot
      ?.querySelectorAll(".primary, .close, .trigger, .menu, .manual, .overlay, .dialog")
      ?.forEach((el) => {
        el.removeEventListener("click", this.#onPrimary);
        el.removeEventListener("click", this.#closeDialog);
        el.removeEventListener("click", this.#toggleMenu);
        el.removeEventListener("click", this.#onMenuClick);
        el.removeEventListener("keydown", this.#onMenuKeydown);
        el.removeEventListener("submit", this.#onManualSubmit);
        el.removeEventListener("keydown", this.#trapTab);
      });
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

  #onPrimary = (): void => {
    if (this.#session !== null) {
      void this.logout();
      return;
    }
    if (providerChoices(this.#providers()).length >= 2) {
      this.#openDialog();
      return;
    }
    void this.login();
  };

  #openDialog(): void {
    if (this.#dialogOpen) {
      return;
    }
    this.#dialogOpen = true;
    this.#errorText = "";
    this.#update();
    const choices = providerChoices(this.#providers());
    this.#selectLastIssuer(choices);
    const trigger = this.shadowRoot?.querySelector<HTMLButtonElement>(".trigger");
    raf(() => trigger?.focus());
  }

  #selectLastIssuer(choices: ProviderChoice[]): void {
    this.#selectedIssuer = choices[0]?.issuer ?? null;
  }

  #closeDialog = (): void => {
    if (!this.#dialogOpen) {
      return;
    }
    this.#dialogOpen = false;
    this.#menuOpen = false;
    this.#activeIndex = -1;
    this.#errorText = "";
    this.#update();
    this.shadowRoot?.querySelector<HTMLButtonElement>(".primary")?.focus();
  };

  #toggleMenu = (): void => {
    this.#menuOpen ? this.#collapseMenu() : this.#expandMenu();
  };

  #expandMenu(): void {
    if (this.#menuOpen) {
      return;
    }
    this.#menuOpen = true;
    const choices = providerChoices(this.#providers());
    if (choices.length === 0) {
      this.#menuOpen = false;
      return;
    }
    const selected = this.#selectedIndex(choices);
    this.#activeIndex = selected;
    this.#update();
    raf(() => {
      this.#updateMenuFlip();
      this.#focusOption();
    });
  }

  /** Open the listbox upward when it would spill beyond the window edge. */
  #updateMenuFlip(): void {
    const menu = this.shadowRoot?.querySelector<HTMLElement>(".menu");
    if (!menu || menu.hidden) {
      return;
    }
    const rect = menu.getBoundingClientRect();
    const room = rect.bottom > (window.innerHeight ?? 0) - 8;
    if (room) {
      menu.setAttribute("data-flip", "up");
    } else {
      menu.removeAttribute("data-flip");
    }
  }

  #collapseMenu(): void {
    if (!this.#menuOpen) {
      return;
    }
    this.#menuOpen = false;
    this.#activeIndex = -1;
    this.#update();
  }

  #selectedIndex(choices: ProviderChoice[]): number {
    const selected = this.#selectedIssuer ?? choices[0]?.issuer ?? "";
    const found = choices.findIndex((c) => c.issuer === selected);
    return found >= 0 ? found : 0;
  }

  #focusOption(): void {
    const options = this.shadowRoot?.querySelectorAll<HTMLLIElement>(".menu li");
    options?.[Math.max(0, this.#activeIndex)]?.focus();
    this.#paintActive();
  }

  #paintActive(): void {
    const options = this.shadowRoot?.querySelectorAll<HTMLLIElement>(".menu li");
    options?.forEach((li, i) => li.setAttribute("data-active", String(i === this.#activeIndex)));
    const active = options?.[this.#activeIndex];
    const menu = this.shadowRoot?.querySelector<HTMLUListElement>(".menu");
    if (active && menu) {
      menu.setAttribute("aria-activedescendant", active.id);
    }
    active?.scrollIntoView({ block: "nearest" });
  }

  #onMenuClick = (event: Event): void => {
    const li = (event.target as HTMLElement).closest("li[data-index]");
    if (li === null) {
      this.#collapseMenu();
      return;
    }
    const index = Number((li as HTMLElement).dataset.index);
    const choices = providerChoices(this.#providers());
    this.#choose(choices[index]);
  };

  #onMenuKeydown = (event: Event): void => {
    const { key } = event as KeyboardEvent;
    const choices = providerChoices(this.#providers());
    if (choices.length === 0) {
      return;
    }
    const cycles = (delta: number): void => {
      event.preventDefault();
      const count = choices.length;
      this.#activeIndex = (this.#activeIndex + delta + count) % count;
      this.#focusOption();
    };
    switch (key) {
      case "ArrowDown":
        return cycles(1);
      case "ArrowUp":
        return cycles(-1);
      case "Home":
        event.preventDefault();
        this.#activeIndex = 0;
        return this.#focusOption();
      case "End":
        event.preventDefault();
        this.#activeIndex = choices.length - 1;
        return this.#focusOption();
      case "Enter":
      case " ":
        event.preventDefault();
        return this.#choose(choices[this.#activeIndex]);
      case "Escape":
        event.preventDefault();
        this.#collapseMenu();
        return;
      case "Tab":
        if (this.#menuOpen) {
          this.#menuOpen = false;
          this.#update();
        }
        return;
      default:
        if (key.length === 1) {
          const letter = key.toLowerCase();
          const start = (this.#activeIndex + 1) % choices.length;
          for (let step = 0; step < choices.length; step++) {
            const i = (start + step) % choices.length;
            if (choices[i] !== undefined && choices[i].name.toLowerCase().startsWith(letter)) {
              this.#activeIndex = i;
              this.#focusOption();
              return;
            }
          }
        }
    }
  };

  #choose(choice: ProviderChoice | undefined): void {
    if (choice === undefined) {
      return;
    }
    // Selection only updates the field; the Continue button performs the login,
    // so the flow is always explicit and predictable.
    this.#selectedIssuer = choice.issuer;
    this.#rememberIssuer(choice.issuer);
    this.#collapseMenu();
    this.#update();
    raf(() => this.shadowRoot?.querySelector<HTMLButtonElement>(".continue")?.focus());
  }

  #onManualSubmit = (event: Event): void => {
    event.preventDefault();
    const input = this.shadowRoot?.querySelector<HTMLInputElement>(".manual input");
    const raw = input?.value.trim() ?? "";
    if (raw === "") {
      const choices = providerChoices(this.#providers());
      const chosen = this.#selectedIssuer ?? choices[0]?.issuer ?? null;
      if (chosen === null) {
        this.#showError("Type a WebID or a provider URL, like https://solidcommunity.net.");
        return;
      }
      this.#rememberIssuer(chosen);
      this.#closeDialog();
      void this.login({ issuer: chosen });
      return;
    }
    const target = classifyInput(raw);
    if (target === null) {
      this.#showError("That does not look like a URL. Include the https:// part.");
      return;
    }
    const options: LoginOptions = target.kind === "issuer" ? { issuer: target.value } : { webId: target.value };
    const rememberedIssuer =
      target.kind === "issuer" ? target.value : resolveIssuerHint(target.value);
    if (rememberedIssuer !== null) {
      this.#rememberIssuer(rememberedIssuer);
    }
    void (async () => {
      const session = await this.login(options);
      if (session !== null) {
        if (rememberedIssuer !== null) {
          this.#rememberIssuer(rememberedIssuer);
        }
        this.#closeDialog();
      }
      this.#update();
    })();
  };

  #showError(text: string): void {
    this.#errorText = text;
    this.#update();
  }

  #rememberIssuer(issuer: string | null): void {
    try {
      if (issuer === null) {
        return;
      }
      localStorage.setItem("seba:last-issuer", issuer);
    } catch {
      /* storage unavailable (private mode) — memory-only is fine */
    }
  }

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
    if (event.reason === "login") {
      this.#rememberIssuer(this.#activeIssuer());
    }
    this.#update();
    if (event.reason === "expired") {
      this.#emit("seba:session-expired", null);
    } else if (event.reason !== "logout") {
      this.#emit(`seba:${event.reason}`, event.session);
      if (event.reason === "login") {
        // Compatibility alias used by SolidOS' <solid-ui-login-button>.
        this.#emit("login-success", event.session);
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

  #identity(): LoginOptions {
    const issuer = this.#attr("issuer") ?? this.#attr("issuer-url");
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

  #activeIssuer(): string | null {
    const remembered = lastIssuer();
    if (remembered !== null && this.#providers().includes(remembered)) {
      return remembered;
    }
    return null;
  }

  #defaultButtonLabel(): string {
    const providers = this.#providers();
    const remembered = lastIssuer();
    const chosen =
      remembered !== null && providers.includes(remembered)
        ? remembered
        : providers.length === 1
          ? providers[0] ?? null
          : null;
    if (chosen === null) {
      return "Sign in with Solid";
    }
    const info = providerInfo(chosen);
    const resuming = remembered !== null && providers.includes(remembered) && providers.length >= 2;
    return `${resuming ? "Continue" : "Sign in"} with ${info.name}`;
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
      `<button part="button" class="primary" type="button">` +
      `<img class="logo" part="logo" alt="" width="48" height="48" decoding="async">` +
      `<span class="label" part="label"></span>` +
      `</button>` +
      `<div class="overlay" part="overlay" hidden>` +
      `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="seba-dialog-title">` +
      `<button class="close" type="button" aria-label="Close sign-in dialog">\u2715</button>` +
      `<h2 id="seba-dialog-title">Sign in to your Pod</h2>` +
      `<p class="sub">Pick where your Pod lives — or paste your WebID and we take it from there.</p>` +
      `<div class="picker">` +
      `<button class="trigger" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Choose your Pod provider">` +
      `<img class="tile" alt="" width="48" height="48" decoding="async">` +
      `<span class="pnames"><span class="pname"></span><i class="pdomain"></i></span>` +
      `<span class="chev" aria-hidden="true"><svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false"><path d="M7 10l5 5 5-5z" fill="currentColor"/></svg></span>` +
      `</button>` +
      `<ul class="menu" role="listbox" aria-label="Pod provider" data-owner="seba" hidden></ul>` +
      `</div>` +
      `<div class="or" aria-hidden="true"><span>or</span></div>` +
      `<form class="manual">` +
      `<input class="webid-input" name="webid" type="text" inputmode="url" autocomplete="off" spellcheck="false" ` +
      `placeholder="WebID or provider URL\u2026" aria-label="WebID or provider URL">` +
      `<button class="continue" type="submit">Continue</button>` +
      `</form>` +
      `<p class="notice" role="alert" hidden></p>` +
      `<p class="signup">New to Solid? <a class="podlink" target="_blank" rel="noopener noreferrer">Create a Pod \u2192</a></p>` +
      `</div>` +
      `</div>`;
    this.#update();
  }

  #update(): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    const button = root.querySelector<HTMLButtonElement>(".primary");
    if (button) {
      const authenticated = this.#session !== null;
      button.dataset.state = authenticated ? "authenticated" : "anonymous";
      button.disabled = this.#busy;
      button.setAttribute("aria-busy", this.#busy ? "true" : "false");
      button.setAttribute("aria-expanded", this.#dialogOpen ? "true" : "false");
      const label = button.querySelector(".label");
      if (label) {
        label.textContent = authenticated ? "Sign out" : (this.#attr("label") ?? this.#defaultButtonLabel());
      }
      const logo = button.querySelector<HTMLImageElement>(".logo");
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

    const overlay = root.querySelector<HTMLElement>(".overlay");
    if (overlay) {
      overlay.hidden = !this.#dialogOpen;
      if (this.#dialogOpen) {
        this.#renderTrigger();
        this.#renderMenu();
        this.#renderSignup();
        const notice = root.querySelector<HTMLElement>(".notice");
        if (notice) {
          notice.hidden = this.#errorText === "";
          notice.textContent = this.#errorText;
        }
        const continueBtn = root.querySelector<HTMLButtonElement>(".continue");
        if (continueBtn) {
          continueBtn.disabled = this.#busy;
        }
      }
    }
  }

  #renderTrigger(): void {
    const root = this.shadowRoot;
    const trigger = root?.querySelector<HTMLButtonElement>(".trigger");
    if (!trigger) {
      return;
    }
    const choices = providerChoices(this.#providers());
    const selIdx = this.#selectedIssuer === null ? -1 : choices.findIndex((c) => c.issuer === this.#selectedIssuer);
    const index = selIdx >= 0 ? selIdx : 0;
    const showTrigger = choices.length >= 2;
    trigger.hidden = !showTrigger;
    const picker = trigger.parentElement;
    const menu = root?.querySelector<HTMLUListElement>(".menu");
    if (picker) {
      picker.hidden = !showTrigger;
    }
    if (menu) {
      menu.hidden = !showTrigger || !this.#menuOpen;
    }
    const or = root?.querySelector<HTMLElement>(".or");
    if (or) {
      or.hidden = !showTrigger;
    }
    if (!showTrigger) {
      return;
    }
    const choice = choices[index];
    if (choice) {
      const tile = trigger.querySelector<HTMLImageElement>(".tile");
      const pname = trigger.querySelector<HTMLElement>(".pname");
      const pdomain = trigger.querySelector<HTMLElement>(".pdomain");
      if (tile) {
        tile.src = choice.iconUri;
      }
      if (pname) {
        pname.textContent = choice.name;
        pname.dataset.issuer = choice.issuer;
      }
      if (pdomain) {
        pdomain.textContent = choice.domain;
      }
    }
    trigger.setAttribute("aria-expanded", this.#menuOpen ? "true" : "false");
  }

  #renderMenu(): void {
    const root = this.shadowRoot;
    const menu = root?.querySelector<HTMLUListElement>(".menu");
    if (!menu || menu.hidden) {
      return;
    }
    const choices = providerChoices(this.#providers());
    const selectedIssuer = this.#selectedIssuer ?? choices[0]?.issuer ?? "";
    const options = choices.map((choice, index) => {
      const li = document.createElement("li");
      li.id = `seba-menu-opt-${index}`;
      li.setAttribute("role", "option");
      li.dataset.index = String(index);
      li.tabIndex = -1;
      li.setAttribute("aria-selected", String(choice.issuer === selectedIssuer));
      li.innerHTML =
        `<img class="tile" alt="" width="48" height="48" decoding="async" src="${choice.iconUri}">` +
        `<span class="pnames"><span class="pname">${escapeHtml(choice.name)}</span>` +
        `<i class="pdomain">${escapeHtml(choice.domain)}</i></span>` +
        `<span class="ok" aria-hidden="true"><svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false"><path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z" fill="currentColor"/></svg></span>`;
      return li;
    });
    menu.replaceChildren(...options);
  }

  #renderSignup(): void {
    const root = this.shadowRoot;
    const link = root?.querySelector<HTMLAnchorElement>(".podlink");
    if (!link) {
      return;
    }
    const choices = providerChoices(this.#providers());
    const selectedIssuer =
      root?.querySelector<HTMLElement>(".pname")?.dataset.issuer ?? choices[0]?.issuer ?? lastIssuer();
    const known = selectedIssuer === null ? null : providerInfo(selectedIssuer);
    const fallback = this.#attr("get-a-pod") ?? "https://solidproject.org/get_a_pod";
    link.href = known?.signup ?? fallback;
  }

  #defaultVariant(): SebaLogoVariant {
    const requested = this.#attr("logo");
    if (requested !== null && isSebaLogoVariant(requested)) {
      return requested;
    }
    // The sign-in button paints a purple gradient in every theme, so the bare
    // white artwork reads cleanly on it; `inverse` keeps its dark box.
    return "white";
  }

  #trapTab = (event: Event): void => {
    if (event.defaultPrevented) {
      return;
    }
    const { key } = event as KeyboardEvent;
    if (key !== "Escape" && key !== "Tab") {
      return;
    }
    if (key === "Escape") {
      if (this.#menuOpen) {
        this.#collapseMenu();
      } else {
        event.preventDefault();
        this.#closeDialog();
      }
      return;
    }
    const focusables = [...(this.shadowRoot?.querySelectorAll<HTMLElement>(
      ".dialog .close, .dialog .trigger, .dialog input, .dialog .continue, .dialog .podlink," +
      (this.#menuOpen ? " .dialog .menu li" : ""),
    ) ?? [])].filter(
      (el) =>
        (el.offsetParent !== null && el.tagName !== "LI") ||
        (this.#menuOpen && el.tagName === "LI"),
    );
    if (focusables.length === 0) {
      return;
    }
    const first = focusables[0] as HTMLElement;
    const last = (focusables[focusables.length - 1] ?? first) as HTMLElement;
    const active = this.shadowRoot?.activeElement ?? null;
    const shift = (event as KeyboardEvent).shiftKey;
    if (shift && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!shift && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  #onOverlayClick = (event: Event): void => {
    if (event.target === this.shadowRoot?.querySelector(".overlay")) {
      event.preventDefault();
      this.#closeDialog();
    }
  };

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

/** One frame, guarded for non-browser test environments. */
function raf(callback: () => void): void {
  if (typeof window === "undefined" || typeof window.requestAnimationFrame !== "function") {
    callback();
    return;
  }
  window.requestAnimationFrame(callback);
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

/** A provider rendering for the picker: brand name, domain and tile artwork. */
export interface ProviderChoice {
  /** Absolute issuer URL. */
  readonly issuer: string;
  /** Friendly brand name (known provider or hostname). */
  readonly name: string;
  /** Hostname for the sub-line. */
  readonly domain: string;
  /** Inline SVG tile, ready for `<img src>`. */
  readonly iconUri: string;
}

/**
 * Turn the raw `providers` list into picker choices, pinning the remembered
 * issuer first so returning users find their last Pod provider at the top.
 */
export function providerChoices(providers: string[]): ProviderChoice[] {
  if (providers.length === 0) {
    return [];
  }
  const remembered = lastIssuer();
  if (remembered !== null && providers.includes(remembered)) {
    providers = [remembered, ...providers.filter((c) => c !== remembered)];
  }
  return providers.map((issuer) => {
    const info = providerInfo(issuer);
    return { issuer, name: info.name, domain: issuerDomain(issuer), iconUri: info.iconUri };
  });
}

/** The remembered issuer from a previous successful login, if any. */
export function lastIssuer(): string | null {
  try {
    return localStorage.getItem("seba:last-issuer");
  } catch {
    return null;
  }
}

/** Clear the remembered issuer (`seba:last-issuer`). */
export function forgetIssuer(): void {
  try {
    localStorage.removeItem("seba:last-issuer");
  } catch {
    /* nothing to forget */
  }
}

/**
 * Classify a manually typed WebID or issuer URL.
 *
 * A value that exactly matches a known provider (or has a bare root path) is an
 * issuer; anything else with a path is treated as a WebID and resolved through
 * `solid:oidcIssuer` discovery. Anything that is not an http(s) URL fails.
 */
export function classifyInput(
  value: string,
): { kind: "issuer" | "webId"; value: string } | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  const bare = url.pathname === "/" || url.pathname === "";
  if (bare) {
    return { kind: "issuer", value: url.href };
  }
  return { kind: "webId", value: url.href };
}

/** Issuer URLs of the curated provider table, for origin matching. */
function providerKeys(): Set<string> {
  return new Set(Object.keys(PROVIDER_INFO));
}

/** Issuer hint for a typed WebID: its origin when that origin is a known provider. */
function resolveIssuerHint(value: string): string | null {
  try {
    const url = new URL(value);
    const originIssuer = url.origin + "/";
    if (providerKeys().has(originIssuer)) {
      return originIssuer;
    }
  } catch {
    /* handled by classifyInput */
  }
  return null;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
