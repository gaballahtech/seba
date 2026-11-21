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
  normalizeIssuer,
  popularityRank,
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
const USAGE_KEY = "seba:provider-usage";
/** Show a filter field once the list is long enough to need one. */
const SEARCH_THRESHOLD = 10;
const SEARCH_SVG =
  `<svg viewBox="0 0 24 24" width="1em" height="1em" focusable="false" aria-hidden="true" ` +
  `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">` +
  `<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>`;

const CHEVRON_SVG =
  `<svg viewBox="0 0 24 24" width="1.05em" height="1.05em" focusable="false" aria-hidden="true">` +
  `<path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const CHEVRON_DOWN_SVG =
  `<svg viewBox="0 0 24 24" width="0.9em" height="0.9em" focusable="false" aria-hidden="true">` +
  `<path d="M7 10l5 5 5-5z" fill="currentColor"/></svg>`;
const BACK_SVG =
  `<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" focusable="false" aria-hidden="true">` +
  `<path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PERSON_SVG =
  `<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" focusable="false" aria-hidden="true">` +
  `<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-4.2 0-7 2.1-7 5v1h14v-1c0-2.9-2.8-5-7-5Z" fill="currentColor"/></svg>`;
const DOTS_SVG =
  `<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" focusable="false" aria-hidden="true">` +
  `<circle cx="5" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="19" cy="12" r="2" fill="currentColor"/></svg>`;

type DialogView = "more" | "create" | "create-other";

interface ChoiceOptions {
  title: string;
  subtitle: string;
  iconUri?: string;
  glyph?: string;
  href?: string;
  issuer?: string;
  action?: string;
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
  /** Full WebID captured by smart detection, so submitting round-trips exactly. */
  #webIdHint: { issuer: string; username: string; webId: string } | null = null;

  /** Current session, or `null` when signed out. */
  get session(): Session | null {
    return this.#session;
  }

  connectedCallback(): void {
    this.#render();
    const root = this.shadowRoot;
    root?.addEventListener("click", this.#onClick);
    root?.addEventListener("submit", this.#onSubmit);
    root?.addEventListener("input", this.#onInput);
    root?.addEventListener("paste", this.#onPaste);
    root?.addEventListener("focusout", this.#onFocusOut);
    root?.addEventListener("keydown", this.#onKeydown);
    void this.#restoreOrComplete();
  }

  disconnectedCallback(): void {
    const root = this.shadowRoot;
    root?.removeEventListener("click", this.#onClick);
    root?.removeEventListener("submit", this.#onSubmit);
    root?.removeEventListener("input", this.#onInput);
    root?.removeEventListener("paste", this.#onPaste);
    root?.removeEventListener("focusout", this.#onFocusOut);
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
    const prefixButton = target.closest(".prefix-button");
    if (prefixButton !== null) {
      const menu = root.querySelector<HTMLElement>(".prefix-menu");
      this.#setPrefixMenu(menu?.hidden ?? true);
      return;
    }
    const prefixOption = target.closest<HTMLElement>(".prefix-option");
    if (prefixOption !== null) {
      const issuer = prefixOption.dataset.issuer;
      this.#prefixIssuer = issuer === CUSTOM_PREFIX ? null : (issuer ?? null);
      this.#webIdHint = null;
      this.#setPrefixMenu(false);
      this.#paintPrefix();
      root.querySelector<HTMLButtonElement>(".prefix-button")?.focus();
      return;
    }
    if (target.closest(".prefix-wrap") === null) {
      this.#setPrefixMenu(false);
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
    if (action === "create-other") {
      this.#dialogView = "create-other";
      this.#update();
    }
  };

  #onPaste = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    if (target === null || !target.classList.contains("webid-input")) {
      return;
    }
    const text = (event as ClipboardEvent).clipboardData?.getData("text") ?? "";
    if (!/^https?:\/\//i.test(text.trim())) {
      return;
    }
    // Let the browser insert the text first, then tidy the field.
    raf(() => this.#detectProvider(target.value));
  };

  #onFocusOut = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    if (target === null || !target.classList.contains("webid-input")) {
      return;
    }
    const value = target.value.trim();
    if (/^https?:\/\//i.test(value)) {
      this.#detectProvider(value);
    }
  };

  #onInput = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    if (target === null) {
      return;
    }
    if (target.classList.contains("prefix-search-input")) {
      this.#filterPrefix(target.value);
    } else if (target.classList.contains("dialog-search-input")) {
      this.#filterDialog(target.value);
    } else if (target.classList.contains("webid-input")) {
      // Editing the name invalidates the captured WebID.
      const hint = this.#webIdHint;
      if (hint !== null && target.value.trim() !== hint.username) {
        this.#webIdHint = null;
      }
    }
  };

  #onSubmit = (event: Event): void => {
    event.preventDefault();
    const root = this.shadowRoot;
    const input = root?.querySelector<HTMLInputElement>(".webid-input");
    const raw = input?.value.trim() ?? "";
    if (/^https?:\/\//i.test(raw)) {
      this.#detectProvider(raw);
    }
    const prefix = this.#prefixIssuer;
    const hint = this.#webIdHint;
    let target: { kind: "issuer" | "webId"; value: string } | null = null;

    if (raw === "") {
      if (prefix === undefined || prefix === null) {
        this.#showError("Type your WebID, or pick a provider next to the field.");
        return;
      }
      target = { kind: "issuer", value: prefix };
    } else if (/^https?:\/\//i.test(raw)) {
      target = classifyInput(raw);
    } else if (hint !== null && raw === hint.username && prefix === hint.issuer) {
      // Reuse the exact WebID we detected, preserving sub-domain style URLs.
      target = classifyInput(hint.webId);
    } else {
      if (prefix === undefined || prefix === null) {
        this.#showError("Enter your username, or paste your full WebID URL.");
        return;
      }
      target = classifyInput(buildWebId(prefix, raw));
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
    const { key } = event as KeyboardEvent;
    if (key === "Escape") {
      const menu = this.shadowRoot?.querySelector<HTMLElement>(".prefix-menu");
      if (menu !== null && menu !== undefined && !menu.hidden) {
        event.preventDefault();
        this.#setPrefixMenu(false);
        this.shadowRoot?.querySelector<HTMLButtonElement>(".prefix-button")?.focus();
        return;
      }
      if (!this.#dialogOpen) {
        return;
      }
      event.preventDefault();
      this.#closeDialog();
      return;
    }
    if (!this.#dialogOpen) {
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
    return this.#sortProviders(raw === null ? ALL_PROVIDERS : parseProviders(raw));
  }

  /** The card's one-tap providers: the most-used three. */
  #primaryProviders(): string[] {
    return this.#allProviders().slice(0, 3);
  }

  /** The remaining providers, shown by "More options" so nothing is duplicated. */
  #restProviders(): string[] {
    return this.#allProviders().slice(3);
  }

  /**
   * Order providers by this browser's sign-in history, then by the curated
   * popularity order. Any site embedding SEBA that sees a provider used more
   * often promotes it, so returning people get their usual Pods first.
   */
  #sortProviders(providers: readonly string[]): string[] {
    const usage = this.#usage();
    return [...providers].sort((a, b) => {
      const usedA = usage[a] ?? 0;
      const usedB = usage[b] ?? 0;
      if (usedA !== usedB) {
        return usedB - usedA;
      }
      return popularityRank(a) - popularityRank(b);
    });
  }

  /** Sign-in counts per issuer, shared by every SEBA app on this origin. */
  #usage(): Record<string, number> {
    try {
      const raw = localStorage.getItem(USAGE_KEY);
      if (raw === null) {
        return {};
      }
      const parsed: unknown = JSON.parse(raw);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return {};
      }
      const counts: Record<string, number> = {};
      for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
        if (typeof value === "number" && Number.isFinite(value) && value > 0) {
          counts[key] = Math.floor(value);
        }
      }
      return counts;
    } catch {
      return {};
    }
  }

  /** Record one successful sign-in for an issuer and re-sort the card. */
  #recordUsage(issuer: string | null): void {
    if (issuer === null) {
      return;
    }
    try {
      const usage = this.#usage();
      const key = normalizeIssuer(issuer);
      usage[key] = (usage[key] ?? 0) + 1;
      localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    } catch {
      /* storage unavailable (private mode) — ordering just stays popular-first */
    }
    this.#update();
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
    row.setAttribute("part", "provider");

    const hit = document.createElement("button");
    hit.type = "button";
    hit.className = "provider-hit";
    hit.setAttribute("part", "provider-hit");
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
    meta.setAttribute("part", "meta");
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
    const issuers = this.#primaryProviders();
    const key = issuers.join("|");
    // Rebuild only when the set or order changes so the staggered entrance
    // plays once instead of replaying on every re-render.
    if (container.dataset.key === key) {
      return;
    }
    container.dataset.key = key;
    const rows = issuers.map((issuer) => this.#providerRow(this.#choiceFor(issuer)));
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
    const menu = this.shadowRoot?.querySelector<HTMLElement>(".prefix-menu");
    if (!menu) {
      return;
    }
    const providers = this.#allProviders();
    const key = providers.join("|");
    if (menu.dataset.key !== key) {
      const options = providers.map((issuer) => {
        const choice = this.#choiceFor(issuer);
        const option = document.createElement("button");
        option.type = "button";
        option.className = "prefix-option";
        option.setAttribute("role", "option");
        option.dataset.issuer = issuer;

        const icon = document.createElement("img");
        icon.className = "prefix-option-icon";
        icon.alt = "";
        icon.width = 22;
        icon.height = 22;
        icon.decoding = "async";
        icon.src = choice.iconUri;

        const meta = document.createElement("span");
        meta.className = "prefix-option-meta";
        const label = document.createElement("span");
        label.className = "prefix-option-label";
        label.textContent = choice.name;
        const domain = document.createElement("span");
        domain.className = "prefix-option-domain";
        domain.textContent = choice.domain;
        meta.append(label, domain);

        option.append(icon, meta);
        return option;
      });

      const custom = document.createElement("button");
      custom.type = "button";
      custom.className = "prefix-option";
      custom.setAttribute("role", "option");
      custom.dataset.issuer = CUSTOM_PREFIX;
      const customIcon = document.createElement("span");
      customIcon.className = "prefix-option-icon glyph";
      customIcon.innerHTML = PERSON_SVG;
      const customMeta = document.createElement("span");
      customMeta.className = "prefix-option-meta";
      const customLabel = document.createElement("span");
      customLabel.className = "prefix-option-label";
      customLabel.textContent = "Custom URL";
      const customDomain = document.createElement("span");
      customDomain.className = "prefix-option-domain";
      customDomain.textContent = "Enter any provider";
      customMeta.append(customLabel, customDomain);
      custom.append(customIcon, customMeta);

      // Custom URL leads the list so people who need it never scroll, but it is
      // not preselected — the most-used provider keeps the default.
      const long = providers.length > SEARCH_THRESHOLD;
      const list = document.createElement("div");
      list.className = "prefix-list";
      list.append(custom, ...options);
      if (long) {
        const empty = document.createElement("p");
        empty.className = "prefix-empty";
        empty.textContent = "No providers match your search.";
        empty.hidden = true;
        list.append(empty);
      }
      const children: HTMLElement[] = [];
      if (long) {
        children.push(this.#searchField("prefix-search-input", "Search providers"));
      }
      children.push(list);
      menu.replaceChildren(...children);
      menu.dataset.key = key;
    }
    if (this.#prefixIssuer === undefined) {
      const remembered = lastIssuer();
      this.#prefixIssuer =
        remembered !== null && providers.includes(remembered) ? remembered : (providers[0] ?? null);
    } else if (this.#prefixIssuer !== null && !providers.includes(this.#prefixIssuer)) {
      this.#prefixIssuer = providers[0] ?? null;
    }
  }

  #paintPrefix(): void {
    const root = this.shadowRoot;
    const icon = root?.querySelector<HTMLImageElement>(".prefix-icon");
    const label = root?.querySelector<HTMLElement>(".prefix-label");
    const input = root?.querySelector<HTMLInputElement>(".webid-input");
    const issuer = this.#prefixIssuer;
    const custom = issuer === null || issuer === undefined;
    if (icon) {
      icon.hidden = custom;
      if (!custom) {
        icon.src = providerInfo(issuer).iconUri;
      }
    }
    if (label) {
      label.textContent = custom ? "Custom URL" : issuerDomain(issuer);
    }
    root?.querySelectorAll<HTMLElement>(".prefix-option").forEach((option) => {
      const selected = option.dataset.issuer === (custom ? CUSTOM_PREFIX : issuer);
      option.setAttribute("aria-selected", String(selected));
      option.classList.toggle("is-selected", selected);
    });
    if (input) {
      input.placeholder = custom ? "pod.example" : "username";
      input.title = custom ? "https://pod.example/profile/card#me" : "e.g. alice";
    }
  }

  /** A filter field used when the provider list is too long to scan. */
  #searchField(className: string, placeholder: string): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "search";
    const icon = document.createElement("span");
    icon.className = "search-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.innerHTML = SEARCH_SVG;
    const input = document.createElement("input");
    input.type = "search";
    input.className = className;
    input.placeholder = placeholder;
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", placeholder);
    wrap.append(icon, input);
    return wrap;
  }

  /** Hide/show prefix options that do not match the typed query. */
  #filterPrefix(query: string): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    const q = query.trim();
    let visible = 0;
    root.querySelectorAll<HTMLElement>(".prefix-option[data-issuer]").forEach((option) => {
      if (option.dataset.issuer === CUSTOM_PREFIX) {
        return;
      }
      const match = matchesSearch(option.textContent ?? "", q);
      option.hidden = !match;
      if (match) {
        visible++;
      }
    });
    const empty = root.querySelector<HTMLElement>(".prefix-empty");
    if (empty) {
      empty.hidden = q === "" || visible !== 0;
    }
  }

  /** Hide/show dialog choices that do not match the typed query. */
  #filterDialog(query: string): void {
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    const q = query.trim();
    let visible = 0;
    root.querySelectorAll<HTMLElement>(".dialog .choice").forEach((choice) => {
      // Keep the "Other provider" entry point reachable while filtering.
      if (choice.dataset.action !== undefined) {
        return;
      }
      const match = matchesSearch(choice.textContent ?? "", q);
      choice.hidden = !match;
      if (match) {
        visible++;
      }
    });
    const empty = root.querySelector<HTMLElement>(".dialog .empty-search");
    if (empty) {
      empty.hidden = q === "" || visible !== 0;
    }
  }

  /**
 * Recognise a pasted/typed WebID: pick the matching provider and reduce the
 * field to the username, or fall back to Custom URL for an unknown host.
 */
  #detectProvider(raw: string): void {
    const value = raw.trim();
    if (!/^https?:\/\//i.test(value)) {
      return;
    }
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return;
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return;
    }
    const issuer = providerForWebId(value, this.#allProviders());
    const input = this.shadowRoot?.querySelector<HTMLInputElement>(".webid-input");
    if (issuer !== null) {
      const name = extractUsername(value, new URL(issuer).hostname);
      this.#prefixIssuer = issuer;
      this.#webIdHint = { issuer, username: name, webId: value };
      if (input !== null && input !== undefined && input.value !== name) {
        input.value = name;
      }
    } else {
      // Unknown host: switch to Custom URL and keep the full address.
      this.#prefixIssuer = null;
      this.#webIdHint = { issuer: "", username: value, webId: value };
      if (input !== null && input !== undefined && input.value !== value) {
        input.value = value;
      }
    }
    this.#paintPrefix();
  }

  /** Open or close the custom provider menu, flipping it to fit the viewport. */
  #setPrefixMenu(open: boolean): void {
    const root = this.shadowRoot;
    const menu = root?.querySelector<HTMLElement>(".prefix-menu");
    const button = root?.querySelector<HTMLButtonElement>(".prefix-button");
    const anchor = root?.querySelector<HTMLElement>(".prefix-wrap");
    if (menu) {
      if (open && anchor) {
        this.#placePrefixMenu(menu, anchor);
      }
      menu.hidden = !open;
    }
    if (button) {
      button.setAttribute("aria-expanded", String(open));
    }
  }

  /**
   * Decide whether the menu opens up or down and cap its height to the space
   * available, so it never pushes the page into a long scroll.
   */
  #placePrefixMenu(menu: HTMLElement, anchor: HTMLElement): void {
    const viewport = window.innerHeight || 0;
    const rect = anchor.getBoundingClientRect();
    const spaceBelow = Math.max(0, viewport - rect.bottom - 12);
    const spaceAbove = Math.max(0, rect.top - 12);
    const openDown = spaceBelow > spaceAbove;
    const space = Math.max(140, Math.min(300, openDown ? spaceBelow : spaceAbove));
    menu.classList.toggle("drop-down", openDown);
    menu.style.setProperty("--seba-menu-space", `${space}px`);
    menu.style.maxHeight = `${space}px`;
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
    // A search field from a previous render would otherwise linger outside the body.
    root.querySelector(".dialog")?.querySelector(":scope > .search")?.remove();
    const titles: Record<DialogView, [string, string]> = {
      more: ["More Pod providers", "Sign in with another supported provider."],
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
      const rest = this.#restProviders();
      const long = this.#allProviders().length > SEARCH_THRESHOLD;
      if (long) {
        body.before(this.#searchField("dialog-search-input", "Search providers"));
      }
      for (const issuer of rest) {
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
      if (long) {
        const empty = document.createElement("p");
        empty.className = "empty-search";
        empty.textContent = "No providers match your search.";
        empty.hidden = true;
        body.append(empty);
      }
    } else if (this.#dialogView === "create") {
      for (const issuer of this.#primaryProviders()) {
        const choice = this.#choiceFor(issuer);
        const href = safeExternalHttpUrl(choice.signup ?? choice.website) ?? undefined;
        body.append(
          this.#choice({
            title: choice.name,
            subtitle: choice.domain,
            iconUri: choice.iconUri,
            href,
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
      const long = this.#allProviders().length > SEARCH_THRESHOLD;
      if (long) {
        body.before(this.#searchField("dialog-search-input", "Search providers"));
      }
      for (const issuer of remaining) {
        const choice = this.#choiceFor(issuer);
        const href = safeExternalHttpUrl(choice.signup ?? choice.website) ?? undefined;
        body.append(
          this.#choice({
            title: choice.name,
            subtitle: choice.domain,
            iconUri: choice.iconUri,
            href,
            disabled: href === undefined,
          }),
        );
      }
      if (remaining.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "No other providers are configured.";
        body.append(empty);
      } else if (long) {
        const empty = document.createElement("p");
        empty.className = "empty-search";
        empty.textContent = "No providers match your search.";
        empty.hidden = true;
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
      `<div class="brand-wrap" part="brand-wrap"><img class="brand" part="brand" alt="" width="48" height="48" decoding="async"></div>` +
      `<div><h2 class="title" part="title" id="seba-card-title">Sign in to your Pod</h2>` +
      `<p class="sub" part="subtitle">Choose your Pod provider to continue.</p></div>` +
      `</header>` +
      `<div class="providers" part="providers" role="group" aria-label="Pod providers"></div>` +
      `<button class="more" part="more" type="button" aria-haspopup="dialog" aria-label="More sign-in options">` +
      `<span class="more-dots" aria-hidden="true">&#8943;</span>` +
      `<span class="more-text">More options</span></button>` +
      `<div class="or" part="or" aria-hidden="true"><span>or</span></div>` +
      `<form class="webid-form">` +
      `<label class="field-label" part="label" for="seba-webid">Continue with your WebID</label>` +
       `<div class="combo" part="combo">` +
       `<span class="prefix-wrap" part="prefix">` +
       `<img class="prefix-icon" alt="" width="48" height="48" decoding="async">` +
       `<button class="prefix-button" part="prefix-button" type="button" aria-haspopup="listbox" aria-expanded="false" aria-label="Pod provider for your WebID">` +
       `<span class="prefix-label">Custom URL</span>` +
       `<span class="prefix-chev" aria-hidden="true">${CHEVRON_DOWN_SVG}</span></button>` +
       `<div class="prefix-menu" part="prefix-menu" role="listbox" aria-label="Pod provider" hidden></div>` +
       `</span>` +
      `<input class="webid-input" part="input" id="seba-webid" name="webid" type="text" inputmode="url" ` +
      `autocomplete="off" spellcheck="false" placeholder="username" aria-label="WebID">` +
      `</div>` +
      `<button class="continue" part="continue" type="submit">Continue</button>` +
      `<p class="notice" part="notice" role="alert" hidden></p>` +
      `</form>` +
      `<p class="trust" part="trust">` +
      `<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">` +
      `<path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm-3 8V7a3 3 0 1 1 6 0v3H9Z" fill="currentColor"/>` +
      `</svg>` +
      `<span>Your password never leaves your provider.</span>` +
      `</p>` +
      `<p class="create" part="create">New to Solid? <button class="create-open" type="button">Get a Pod</button></p>` +
      `</div>` +
      `<div class="signed-in" part="signed-in" hidden>` +
      `<div class="account-head">` +
      `<span class="account-mark" part="account-mark" aria-hidden="true">${PERSON_SVG}</span>` +
      `<div><p class="eyebrow">Signed in</p>` +
      `<p class="account-title">Your Pod is connected</p></div>` +
      `</div>` +
      `<p class="account-webid" part="webid"></p>` +
      `<button class="signout" part="signout" type="button">Sign out</button>` +
      `</div>` +
      `</section>` +
      `<div class="overlay" part="overlay" hidden>` +
      `<div class="dialog" part="dialog" role="dialog" aria-modal="true" aria-labelledby="seba-dialog-title">` +
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
      const brandWrap = root.querySelector<HTMLElement>(".brand-wrap");
      const brand = root.querySelector<HTMLImageElement>(".brand");
      if (brand) {
        const requested = this.#attr("logo");
        if (requested === "none") {
          if (brandWrap) brandWrap.hidden = true;
          brand.hidden = true;
        } else {
          if (brandWrap) brandWrap.hidden = false;
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
    const more = root.querySelector<HTMLElement>(".more");
    if (more) {
      // Nothing left to show when the card already lists every allowed provider.
      more.hidden = this.#restProviders().length === 0;
      more.setAttribute(
        "aria-expanded",
        String(this.#dialogOpen && this.#dialogView === "more"),
      );
    }

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
      this.#recordUsage(event.session?.provider ?? this.#activeIssuer());
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
/**
 * Build a WebID from a provider prefix and what the person typed.
 *
 * A bare name ("alice") becomes the standard Solid profile document; anything
 * that already looks like a path or a fragment is used as-is. Full URLs never
 * reach here.
 */
export function buildWebId(prefix: string, raw: string): string {
  if (/^https?:\/\//i.test(raw)) {
    return raw.trim();
  }
  const base = prefix.replace(/\/+$/, "");
  const value = raw.replace(/^\/+/, "").replace(/\/+$/, "");
  const path = value.includes("/") || value.includes("#") ? value : `${value}/profile/card#me`;
  return `${base}/${path}`;
}

/** Strip the noise a person pastes with a URL so matching stays forgiving. */
function normalizeSearch(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/[/?#]+$/, "");
}

/** Match a query against an option's visible text, URL-aware. */
export function matchesSearch(text: string, query: string): boolean {
  const q = normalizeSearch(query);
  if (q === "") {
    return true;
  }
  if (normalizeSearch(text).includes(q)) {
    return true;
  }
  return text.toLowerCase().includes(query.trim().toLowerCase());
}

/** The provider that owns a WebID URL, or `null` for an unknown host. */
export function providerForWebId(webId: string, providers: readonly string[]): string | null {
  let url: URL;
  try {
    url = new URL(webId);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const roots = new Map<string, string>();
  for (const issuer of providers) {
    let issuerHost: string;
    try {
      issuerHost = new URL(issuer).hostname.toLowerCase();
    } catch {
      continue;
    }
    if (host === issuerHost) {
      return issuer;
    }
    const root = issuerHost.split(".").slice(-2).join(".");
    if (root !== "" && !roots.has(root)) {
      roots.set(root, issuer);
    }
  }
  // Sub-domains count: id.inrupt.com belongs to login.inrupt.com's provider.
  return roots.get(host.split(".").slice(-2).join(".")) ?? null;
}

/**
 * The username segment of a WebID, ignoring the standard profile suffix.
 *
 * Handles both layouts: `provider.tld/alice/profile/card#me` and the
 * subdomain form `alice.provider.tld/profile/card#me` used by NSS hosts.
 */
export function extractUsername(webId: string, providerHost?: string): string {
  let url: URL;
  try {
    url = new URL(webId);
  } catch {
    return "";
  }
  const host = url.hostname.toLowerCase();
  if (providerHost !== undefined) {
    const base = providerHost.toLowerCase();
    const rootDomain = base.split(".").length <= 2;
    if (rootDomain && host !== base && host.endsWith(`.${base}`)) {
      const sub = host.slice(0, -(base.length + 1));
      if (sub !== "" && !sub.includes(".") && sub !== "www") {
        return sub;
      }
    }
  }
  const segments = url.pathname
    .split("/")
    .filter(Boolean)
    .filter((segment) => segment !== "profile" && segment !== "card");
  return segments[0] ?? "";
}

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
