/**
 * `<seba-login>`: a zero-dependency, Google-quality sign-in card.
 *
 * The element renders an inline card (not a modal) with one-tap buttons for the
 * three primary Pod providers, a "more options" button that opens either the
 * full provider list or the WebID field, a "create an account" flow, and a
 * phone-style WebID field: pick a provider on the left, type the rest of the
 * identifier on the right. Importing the package registers nothing until
 * `defineSebaLogin` is called (or the React wrapper imports it).
 */

import { CARD_STYLES } from "./assets/card-styles.js";
import { isSebaLogoVariant, sebaLogoImage } from "./assets/icons.js";
import {
  ALL_PROVIDERS,
  issuerDomain,
  PRIMARY_PROVIDERS,
  providerInfo,
} from "./assets/providers.js";
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

const CUSTOM_PREFIX = "__custom__";

const CHEVRON_SVG =
  `<svg viewBox="0 0 24 24" width="1.05em" height="1.05em" focusable="false" aria-hidden="true">` +
  `<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEVRON_DOWN_SVG =
  `<svg viewBox="0 0 24 24" width="0.9em" height="0.9em" focusable="false" aria-hidden="true">` +
  `<path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>`;
const BACK_SVG =
  `<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" focusable="false" aria-hidden="true">` +
  `<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const GRID_SVG =
  `<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" focusable="false" aria-hidden="true">` +
  `<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="currentColor"/></svg>`;
const PERSON_SVG =
  `<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" focusable="false" aria-hidden="true">` +
  `<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.2 0-7 2.1-7 5v1h14v-1c0-2.9-2.8-5-7-5Z" fill="currentColor"/></svg>`;
const DOTS_SVG =
  `<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" focusable="false" aria-hidden="true">` +
  `<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>`;

type DialogView = "more" | "providers" | "create" | "create-other";

interface ChoiceOptions {
  title: string;
  subtitle: string;
  iconUri?: string;
  glyph?: string;
  href?: string;
  issuer?: string;
  action?: string;
  badge?: string;
  disabled?: boolean;
}

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
  #dialogView: DialogView = "more";
  #dialogTrigger: HTMLElement | null = null;
  #errorText = "";
  /** Selected WebID prefix; `undefined` = not chosen yet, `null` = custom URL. */
  #prefixIssuer: string | null | undefined = undefined;

  /** Current session, or `null` when signed out. */
  get session(): Session | null {
    return this.#session;
  }

  connectedCallback(): void {
    this.#render();
    const root = this.shadowRoot;
    root?.addEventListener("click", this.#onClick);
    root?.addEventListener("submit", this.#onSubmit);
    root?.addEventListener("change", this.#onChange);
    root?.addEventListener("keydown", this.#onKeydown);
    void this.#restoreOrComplete();
  }

  disconnectedCallback(): void {
    const root = this.shadowRoot;
    root?.removeEventListener("click", this.#onClick);
    root?.removeEventListener("submit", this.#onSubmit);
    root?.removeEventListener("change", this.#onChange);
    root?.removeEventListener("keydown", this.#onKeydown);
  }

  attributeChangedCallback(name: string, _oldValue: string | null, _newValue: string | null): void {
    if (name === "client-id" || name === "redirect-uri" || name === "account" || name === "config") {
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

  #onClick = (event: Event): void => {
    const target = event.target instanceof Element ? event.target : null;
    const root = this.shadowRoot;
    if (target === null || root === null) {
      return;
    }
    if (target === root.querySelector(".overlay")) {
      this.#closeDialog();
      return;
    }
    const providerHit = target.closest<HTMLElement>(".provider-hit");
    if (providerHit?.dataset.issuer !== undefined) {
      void this.#startLogin({ issuer: providerHit.dataset.issuer });
      return;
    }
    if (target.closest(".more") !== null) {
      this.#openDialog("more", target.closest<HTMLElement>(".more"));
      return;
    }
    if (target.closest(".create-open") !== null) {
      this.#openDialog("create", target.closest<HTMLElement>(".create-open"));
      return;
    }
    if (target.closest(".dialog-close") !== null) {
      this.#closeDialog();
      return;
    }
    if (target.closest(".dialog-back") !== null) {
      this.#dialogView = this.#dialogView === "create-other" ? "create" : "more";
      this.#update();
      return;
    }
    if (target.closest(".signout") !== null) {
      void this.logout();
      return;
    }
    const issuerChoice = target.closest<HTMLElement>(".choice[data-issuer]");
    if (issuerChoice?.dataset.issuer !== undefined) {
      this.#closeDialog();
      void this.#startLogin({ issuer: issuerChoice.dataset.issuer });
      return;
    }
    const action = target.closest<HTMLElement>(".choice[data-action]")?.dataset.action;
    if (action === "providers") {
      this.#dialogView = "providers";
      this.#update();
      return;
    }
    if (action === "webid") {
      this.#closeDialog();
      raf(() => this.shadowRoot?.querySelector<HTMLInputElement>(".webid-input")?.focus());
      return;
    }
    if (action === "create-other") {
      this.#dialogView = "create-other";
      this.#update();
    }
  };

  #onChange = (event: Event): void => {
    const target = event.target as HTMLSelectElement | null;
    if (target === null || !target.classList.contains("prefix")) {
      return;
    }
    this.#prefixIssuer = target.value === CUSTOM_PREFIX ? null : target.value;
    this.#paintPrefix();
  };

  #onSubmit = (event: Event): void => {
    event.preventDefault();
    const root = this.shadowRoot;
    const input = root?.querySelector<HTMLInputElement>(".webid-input");
    const raw = input?.value.trim() ?? "";
    const prefix = this.#prefixIssuer;
    let target: { kind: "issuer" | "webId"; value: string } | null = null;

    if (raw === "") {
      if (prefix === undefined || prefix === null) {
        this.#showError("Type your WebID, or pick a provider next to the field.");
        return;
      }
      target = { kind: "issuer", value: prefix };
    } else if (/^https?:\/\//i.test(raw)) {
      target = classifyInput(raw);
    } else {
      if (prefix === undefined || prefix === null) {
        this.#showError("Paste your full WebID URL, including https://.");
        return;
      }
      target = classifyInput(`${prefix.replace(/\/$/, "")}/${raw.replace(/^\/+/, "")}`);
    }

    if (target === null) {
      this.#showError("That does not look like a WebID. Check the address and try again.");
      return;
    }
    void this.#startLogin(
      target.kind === "issuer" ? { issuer: target.value } : { webId: target.value },
    );
  };

  #onKeydown = (event: Event): void => {
    if (!this.#dialogOpen) {
      return;
    }
    const { key } = event as KeyboardEvent;
    if (key === "Escape") {
      event.preventDefault();
      this.#closeDialog();
      return;
    }
    if (key !== "Tab") {
      return;
    }
    const dialog = this.shadowRoot?.querySelector<HTMLElement>(".dialog");
    if (!dialog) {
      return;
    }
    const focusables = [...dialog.querySelectorAll<HTMLElement>("button:not([disabled]), a[href]")].filter(
      (el) => !el.hidden,
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first === undefined || last === undefined) {
      return;
    }
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

  async #startLogin(options: LoginOptions): Promise<void> {
    if (options.issuer !== undefined) {
      this.#prefixIssuer = options.issuer;
    }
    this.#errorText = "";
    this.#rememberIssuer(options.issuer ?? this.#prefixIssuer ?? null);
    await this.login(options);
  }

  #openDialog(view: DialogView, trigger: Element | null): void {
    this.#dialogOpen = true;
    this.#dialogView = view;
    this.#dialogTrigger = trigger instanceof HTMLElement ? trigger : null;
    this.#update();
    raf(() => {
      const first =
        this.shadowRoot?.querySelector<HTMLElement>(".dialog .choice") ??
        this.shadowRoot?.querySelector<HTMLElement>(".dialog-close");
      first?.focus();
    });
  }

  #closeDialog(): void {
    if (!this.#dialogOpen) {
      return;
    }
    this.#dialogOpen = false;
    this.#update();
    const trigger = this.#dialogTrigger;
    this.#dialogTrigger = null;
    raf(() => trigger?.focus());
  }

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

  #allProviders(): string[] {
    const raw = this.#attr("providers");
    return raw === null ? [...ALL_PROVIDERS] : parseProviders(raw);
  }

  #primaryProviders(): string[] {
    const raw = this.#attr("providers");
    if (raw === null) {
      return [...PRIMARY_PROVIDERS];
    }
    return parseProviders(raw).slice(0, 3);
  }

  #choiceFor(issuer: string): ProviderChoice {
    const info = providerInfo(issuer);
    return {
      issuer,
      name: info.name,
      domain: issuerDomain(issuer),
      iconUri: info.iconUri,
      website: info.website,
      signup: info.signup,
    };
  }

  #providerRow(choice: ProviderChoice): HTMLElement {
    const row = document.createElement("div");
    row.className = "provider";

    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = "provider-hit";
    hit.dataset.issuer = choice.issuer;
    hit.setAttribute("aria-label", `Sign in with ${choice.name}`);

    const tile = document.createElement("img");
    tile.className = "tile";
    tile.alt = "";
    tile.width = 48;
    tile.height = 48;
    tile.decoding = "async";
    tile.src = choice.iconUri;

    const meta = document.createElement("span");
    meta.className = "pmeta";
    const name = document.createElement("span");
    name.className = "pname";
    name.textContent = choice.name;

    let site: HTMLElement;
    const website = safeExternalHttpUrl(choice.website);
    if (website !== null) {
      const anchor = document.createElement("a");
      anchor.href = website;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      anchor.textContent = choice.domain;
      anchor.title = `${choice.name} website`;
      site = anchor;
    } else {
      const label = document.createElement("span");
      label.textContent = choice.domain;
      site = label;
    }
    site.className = "psite";
    meta.append(name, site);

    const chevron = document.createElement("span");
    chevron.className = "chev";
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = CHEVRON_SVG;

    row.append(hit, tile, meta, chevron);
    return row;
  }

  #renderPrimary(): void {
    const container = this.shadowRoot?.querySelector<HTMLElement>(".providers");
    if (!container) {
      return;
    }
    const rows = this.#primaryProviders().map((issuer) =>
      this.#providerRow(this.#choiceFor(issuer)),
    );
    if (rows.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "No Pod providers are configured for this app.";
      container.replaceChildren(empty);
      return;
    }
    container.replaceChildren(...rows);
  }

  #syncPrefix(): void {
    const select = this.shadowRoot?.querySelector<HTMLSelectElement>(".prefix");
    if (!select) {
      return;
    }
    const providers = this.#allProviders();
    const key = providers.join("|");
    if (select.dataset.key !== key) {
      const options = providers.map((issuer) => {
        const option = document.createElement("option");
        option.value = issuer;
        option.textContent = issuerDomain(issuer);
        return option;
      });
      const custom = document.createElement("option");
      custom.value = CUSTOM_PREFIX;
      custom.textContent = "Custom URL";
      select.replaceChildren(...options, custom);
      select.dataset.key = key;
    }
    if (this.#prefixIssuer === undefined) {
      const remembered = lastIssuer();
      this.#prefixIssuer =
        remembered !== null && providers.includes(remembered) ? remembered : (providers[0] ?? null);
    } else if (this.#prefixIssuer !== null && !providers.includes(this.#prefixIssuer)) {
      this.#prefixIssuer = providers[0] ?? null;
    }
    select.value =
      this.#prefixIssuer === null || this.#prefixIssuer === undefined
        ? CUSTOM_PREFIX
        : this.#prefixIssuer;
  }

  #paintPrefix(): void {
    const root = this.shadowRoot;
    const icon = root?.querySelector<HTMLImageElement>(".prefix-icon");
    const input = root?.querySelector<HTMLInputElement>(".webid-input");
    const issuer = this.#prefixIssuer;
    const custom = issuer === null || issuer === undefined;
    if (icon) {
      icon.hidden = custom;
      if (!custom) {
        icon.src = providerInfo(issuer).iconUri;
      }
    }
    if (input) {
      input.placeholder = custom ? "https://your-pod.example/profile/card#me" : "profile/card#me";
    }
  }

  #choice(options: ChoiceOptions): HTMLElement {
    let element: HTMLElement;
    let button: HTMLButtonElement | null = null;
    if (options.href !== undefined) {
      const anchor = document.createElement("a");
      anchor.href = options.href;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      element = anchor;
    } else {
      button = document.createElement("button");
      button.type = "button";
      element = button;
    }
    element.className = "choice";
    if (options.issuer !== undefined) {
      element.dataset.issuer = options.issuer;
    }
    if (options.action !== undefined) {
      element.dataset.action = options.action;
    }
    if (button !== null) {
      button.disabled = options.disabled === true;
    }

    let icon: HTMLElement;
    if (options.iconUri !== undefined) {
      const image = document.createElement("img");
      image.className = "choice-icon";
      image.alt = "";
      image.width = 48;
      image.height = 48;
      image.decoding = "async";
      image.src = options.iconUri;
      icon = image;
    } else {
      const glyph = document.createElement("span");
      glyph.className = "choice-icon glyph";
      glyph.innerHTML = options.glyph ?? DOTS_SVG;
      icon = glyph;
    }

    const meta = document.createElement("span");
    meta.className = "choice-meta";
    const title = document.createElement("span");
    title.className = "choice-title";
    title.textContent = options.title;
    const subtitle = document.createElement("span");
    subtitle.className = "choice-sub";
    subtitle.textContent = options.subtitle;
    meta.append(title, subtitle);

    element.append(icon, meta);
    if (options.badge !== undefined) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = options.badge;
      element.append(badge);
    }
    const chevron = document.createElement("span");
    chevron.className = "chev";
    chevron.setAttribute("aria-hidden", "true");
    chevron.innerHTML = CHEVRON_SVG;
    element.append(chevron);
    return element;
  }

  #renderDialog(): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    const titles: Record<DialogView, [string, string]> = {
      more: ["Sign in to your Pod", "Choose how you want to continue."],
      providers: ["Choose a Pod provider", "We'll take you to your provider to sign in."],
      create: ["Create a Solid Pod", "Pick a provider to create your Pod."],
      "create-other": ["More Pod providers", "Choose where you want to create your Pod."],
    };
    const [titleText, subtitleText] = titles[this.#dialogView];
    const title = root.querySelector<HTMLElement>("#seba-dialog-title");
    const subtitle = root.querySelector<HTMLElement>(".dsub");
    if (title) {
      title.textContent = titleText;
    }
    if (subtitle) {
      subtitle.textContent = subtitleText;
    }
    const back = root.querySelector<HTMLButtonElement>(".dialog-back");
    if (back) {
      back.hidden = this.#dialogView === "more" || this.#dialogView === "create";
    }
    const body = root.querySelector<HTMLElement>(".dbody");
    if (!body) {
      return;
    }
    body.replaceChildren();

    if (this.#dialogView === "more") {
      body.append(
        this.#choice({
          title: "Choose a Pod provider",
          subtitle: "Browse every provider SEBA supports",
          glyph: GRID_SVG,
          action: "providers",
        }),
        this.#choice({
          title: "Use your WebID",
          subtitle: "We'll discover your provider automatically",
          glyph: PERSON_SVG,
          action: "webid",
        }),
      );
    } else if (this.#dialogView === "providers") {
      for (const issuer of this.#allProviders()) {
        const choice = this.#choiceFor(issuer);
        body.append(
          this.#choice({
            title: choice.name,
            subtitle: choice.domain,
            iconUri: choice.iconUri,
            issuer: choice.issuer,
          }),
        );
      }
    } else if (this.#dialogView === "create") {
      for (const issuer of this.#primaryProviders()) {
        const choice = this.#choiceFor(issuer);
        const href = safeExternalHttpUrl(choice.signup ?? choice.website) ?? undefined;
        body.append(
          this.#choice({
            title: choice.name,
            subtitle: `Create a Pod at ${choice.domain}`,
            iconUri: choice.iconUri,
            href,
            badge: "Create",
            disabled: href === undefined,
          }),
        );
      }
      body.append(
        this.#choice({
          title: "Other provider",
          subtitle: "Browse more Pod providers",
          glyph: DOTS_SVG,
          action: "create-other",
        }),
      );
    } else {
      const primary = new Set(this.#primaryProviders());
      const remaining = this.#allProviders().filter((issuer) => !primary.has(issuer));
      for (const issuer of remaining) {
        const choice = this.#choiceFor(issuer);
        const href = safeExternalHttpUrl(choice.signup ?? choice.website) ?? undefined;
        body.append(
          this.#choice({
            title: choice.name,
            subtitle: choice.domain,
            iconUri: choice.iconUri,
            href,
            badge: "Create",
            disabled: href === undefined,
          }),
        );
      }
      if (remaining.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No other providers are configured.";
        body.append(empty);
      }
    }

    const foot = root.querySelector<HTMLElement>(".dfoot");
    if (foot) {
      if (this.#dialogView === "create" || this.#dialogView === "create-other") {
        const link = document.createElement("a");
        link.href =
          safeExternalHttpUrl(this.#attr("get-a-pod")) ?? "https://solidproject.org/get_a_pod";
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = "Learn more about Solid Pods";
        foot.replaceChildren(link);
        foot.hidden = false;
      } else {
        foot.replaceChildren();
        foot.hidden = true;
      }
    }
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
      `<style>${CARD_STYLES}</style>` +
      `<section class="card" part="card" aria-labelledby="seba-card-title">` +
      `<div class="signed-out">` +
      `<header class="head">` +
      `<img class="brand" alt="" width="48" height="48" decoding="async">` +
      `<div><h2 class="title" id="seba-card-title">Sign in to your Pod</h2>` +
      `<p class="sub">Choose your Pod provider to continue.</p></div>` +
      `</header>` +
      `<div class="providers" role="group" aria-label="Pod providers"></div>` +
      `<button class="more" type="button" aria-haspopup="dialog" aria-label="More sign-in options">` +
      `<span class="more-dots" aria-hidden="true">&#8943;</span>` +
      `<span class="more-text">More options</span></button>` +
      `<p class="create">New to Solid? <button class="create-open" type="button">Get a Pod</button></p>` +
      `<div class="or" aria-hidden="true"><span>or</span></div>` +
      `<form class="webid-form">` +
      `<label class="field-label" for="seba-webid">Continue with your WebID</label>` +
      `<div class="combo">` +
      `<span class="prefix-wrap">` +
      `<img class="prefix-icon" alt="" width="48" height="48" decoding="async">` +
      `<select class="prefix" aria-label="Pod provider for your WebID"></select>` +
      `<span class="prefix-chev" aria-hidden="true">${CHEVRON_DOWN_SVG}</span>` +
      `</span>` +
      `<input class="webid-input" id="seba-webid" name="webid" type="text" inputmode="url" ` +
      `autocomplete="off" spellcheck="false" placeholder="profile/card#me" aria-label="WebID">` +
      `</div>` +
      `<button class="continue" type="submit">Continue</button>` +
      `<p class="notice" role="alert" hidden></p>` +
      `</form>` +
      `<p class="trust">` +
      `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">` +
      `<path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" fill="currentColor"/>` +
      `</svg>` +
      `<span>Your password never leaves your provider.</span>` +
      `</p>` +
      `</div>` +
      `<div class="signed-in" hidden>` +
      `<div class="account-head">` +
      `<span class="account-mark" aria-hidden="true">${PERSON_SVG}</span>` +
      `<div><p class="eyebrow">Signed in</p>` +
      `<p class="account-title">Your Pod is connected</p></div>` +
      `</div>` +
      `<p class="account-webid"></p>` +
      `<button class="signout" type="button">Sign out</button>` +
      `</div>` +
      `</section>` +
      `<div class="overlay" part="overlay" hidden>` +
      `<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="seba-dialog-title">` +
      `<div class="dhead">` +
      `<button class="dialog-back" type="button" aria-label="Back" hidden>${BACK_SVG}</button>` +
      `<h2 id="seba-dialog-title">Sign in to your Pod</h2>` +
      `<button class="dialog-close" type="button" aria-label="Close">&#10005;</button>` +
      `</div>` +
      `<p class="dsub"></p>` +
      `<div class="dbody"></div>` +
      `<p class="dfoot" hidden></p>` +
      `</div>` +
      `</div>`;
    this.#update();
  }

  #update(): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    const signedIn = this.#session !== null;
    const signedOut = root.querySelector<HTMLElement>(".signed-out");
    const account = root.querySelector<HTMLElement>(".signed-in");
    if (signedOut) {
      signedOut.hidden = signedIn;
    }
    if (account) {
      account.hidden = !signedIn;
    }

    const card = root.querySelector<HTMLElement>(".card");
    card?.setAttribute("aria-busy", this.#busy ? "true" : "false");

    if (signedIn && this.#session !== null) {
      const webId = root.querySelector<HTMLElement>(".account-webid");
      if (webId) {
        webId.textContent = this.#session.webId;
      }
    } else {
      const title = root.querySelector<HTMLElement>(".title");
      if (title) {
        title.textContent = this.#attr("label") ?? "Sign in to your Pod";
      }
      const brand = root.querySelector<HTMLImageElement>(".brand");
      if (brand) {
        const requested = this.#attr("logo");
        if (requested === "none") {
          brand.hidden = true;
        } else {
          brand.hidden = false;
          brand.src = sebaLogoImage(
            requested !== null && isSebaLogoVariant(requested) ? requested : "primary",
          );
        }
      }
      this.#renderPrimary();
      this.#syncPrefix();
      this.#paintPrefix();
      const notice = root.querySelector<HTMLElement>(".notice");
      if (notice) {
        notice.hidden = this.#errorText === "";
        notice.textContent = this.#errorText;
      }
    }

    root
      .querySelectorAll<HTMLButtonElement>(".provider-hit, .more, .create-open, .continue, .signout")
      .forEach((button) => {
        button.disabled = this.#busy;
      });
    root
      .querySelector<HTMLElement>(".more")
      ?.setAttribute(
        "aria-expanded",
        String(this.#dialogOpen && (this.#dialogView === "more" || this.#dialogView === "providers")),
      );

    const overlay = root.querySelector<HTMLElement>(".overlay");
    if (overlay) {
      overlay.hidden = !this.#dialogOpen;
      if (this.#dialogOpen) {
        this.#renderDialog();
      }
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
      this.#closeDialog();
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

  #activeIssuer(): string | null {
    const remembered = lastIssuer();
    if (remembered !== null && this.#allProviders().includes(remembered)) {
      return remembered;
    }
    return null;
  }

  #emit(type: string, session: Session | null): void {
    if (typeof this.dispatchEvent !== "function") {
      return;
    }
    this.dispatchEvent(new CustomEvent(type, { detail: { session }, bubbles: true, composed: true }));
  }

  #fail(error: unknown): void {
    this.#errorText = error instanceof Error ? error.message : String(error);
    this.#update();
    if (typeof this.dispatchEvent !== "function") {
      return;
    }
    this.dispatchEvent(
      new CustomEvent("seba:error", { detail: { error }, bubbles: true, composed: true }),
    );
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

/** A provider rendering for the card: brand name, domain, site and artwork. */
export interface ProviderChoice {
  /** Absolute issuer URL. */
  readonly issuer: string;
  /** Friendly brand name (known provider or hostname). */
  readonly name: string;
  /** Hostname for the sub-line. */
  readonly domain: string;
  /** Inline SVG tile, ready for `<img src>`. */
  readonly iconUri: string;
  /** Public provider website, or `null` when unknown. */
  readonly website: string | null;
  /** Account sign-up URL, or `null` when unknown. */
  readonly signup: string | null;
}

/**
 * Turn the raw `providers` list into card choices, pinning the remembered
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
    return {
      issuer,
      name: info.name,
      domain: issuerDomain(issuer),
      iconUri: info.iconUri,
      website: info.website,
      signup: info.signup,
    };
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

/**
 * Validate an external navigation URL for use in element links.
 *
 * Only absolute `https:` URLs are accepted to prevent `javascript:`, `data:`,
 * and other unsafe schemes from being used in rendered anchors.
 *
 * @returns The normalized `href`, or `null` when the value is missing or unsafe.
 */
export function safeExternalHttpUrl(value: string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
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
