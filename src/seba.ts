/**
 * The `Seba` facade: resolves the runtime platform, then forwards to the protocol engine.
 *
 * The platform module is imported dynamically so a browser bundle never includes the
 * Node.js HTTP server and vice versa.
 */

import { SebaClient, isAuthorizationResponse } from "./core/client.js";
import { SessionEmitter } from "./core/events.js";
import type {
  LoginOptions,
  Platform,
  SebaConfig,
  Session,
  SessionChangeListener,
  SessionInfo,
} from "./types.js";

async function loadPlatform(): Promise<Platform> {
  const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  if (isBrowser) {
    const { createBrowserPlatform } = await import("./browser/platform.js");
    return createBrowserPlatform();
  }
  const { createNodePlatform } = await import("./node/platform.js");
  return createNodePlatform();
}

async function loadNamespacer(): Promise<(platform: Platform, account: string) => Platform> {
  const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  if (isBrowser) {
    const { namespaceBrowserPlatform } = await import("./browser/platform.js");
    return namespaceBrowserPlatform;
  }
  // Node.js sessions live in per-instance memory, so no namespacing is needed.
  return (platform) => platform;
}

/**
 * Solid-OIDC client with four operations: {@link Seba.login}, {@link Seba.restoreSession},
 * {@link Seba.fetch} and {@link Seba.logout}.
 *
 * @example
 * ```ts
 * const seba = new Seba({
 *   clientId: "https://app.example/client-id.jsonld",
 *   redirectUri: "https://app.example/auth/callback",
 * });
 *
 * const session = await seba.restoreSession() ?? await seba.login({ webId });
 * const response = await seba.fetch(session.webId);
 * ```
 */
export class Seba {
  readonly #client: Promise<SebaClient>;
  readonly #events = new SessionEmitter();


  /**
   * @param config - Client ID Document URL, redirect URI and optional storage settings.
   *   Configuration is validated when the first operation runs.
   */
  constructor(config: SebaConfig) {
    this.#client = (async () => {
      const [platform, namespacer] = await Promise.all([loadPlatform(), loadNamespacer()]);
      const scoped = config.account === undefined ? platform : namespacer(platform, config.account);
      return new SebaClient(config, scoped, {
        onSessionChange: (event) => {
          this.#events.emit(event);
        },
      });
    })();
  }

  /**
   * Subscribe to session transitions (`login`, `restore`, `logout`, `expired`).
   *
   * @returns An unsubscribe function.
   */
  onSessionChange(listener: SessionChangeListener): () => void {
    return this.#events.on(listener);
  }

  /** Remove a listener previously added with {@link Seba.onSessionChange}. */
  offSessionChange(listener: SessionChangeListener): void {
    this.#events.off(listener);
  }

  /**
   * Subscribe to the single `expired` transition of a session.
   *
   * @returns An unsubscribe function.
   */
  onSessionExpired(listener: SessionChangeListener): () => void {
    return this.onSessionChange((event) => {
      if (event.reason === "expired") {
        listener(event);
      }
    });
  }

  /** Token-free current session, or `null` when signed out. */
  async getSession(): Promise<Session | null> {
    return (await this.#client).session;
  }

  /** Start or finish an interactive login. See {@link SebaClient.login}. */
  async login(options: LoginOptions = {}): Promise<Session> {
    return (await this.#client).login(options);
  }

  /**
   * Complete a login whose callback URL is in the current address, WITHOUT starting a
   * new one. Throws when no authorization response is present, so applications can
   * call it on page load only when the URL actually carries `code`/`error` + `state`.
   * This avoids the "login() never settles" redirect mode in explicit flows.
   *
   * @throws {@link SebaAuthError} when the current URL carries no callback parameters.
   */
  async completeLogin(): Promise<Session> {
    return (await this.#client).completeLoginFromCurrentUrl();
  }

  /** Whether the given (or current) URL carries an authorization response. */
  static isCallbackResponse(url?: string | URL): boolean {
    let target: URL;
    if (url === undefined) {
      if (typeof window === "undefined") {
        return false;
      }
      target = new URL(window.location.href);
    } else {
      try {
        target = url instanceof URL ? url : new URL(url);
      } catch {
        return false;
      }
    }
    return isAuthorizationResponse(target);
  }

  /** Restore a stored session, or `null` when none exists. */
  async restoreSession(): Promise<Session | null> {
    return (await this.#client).restoreSession();
  }

  /**
   * Token-free details of the current session (WebID, provider and access-token
   * expiry), or `null` when no session is active. Lets applications warn the user
   * before the access token expires instead of failing mid-request.
   */
  async getSessionInfo(): Promise<SessionInfo | null> {
    return (await this.#client).sessionInfo();
  }

  /** DPoP-authenticated `fetch`. Never forwards credentials to another origin. */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return (await this.#client).fetch(input, init);
  }

  /** Sign out and revoke the refresh token when the provider supports it. */
  async logout(): Promise<void> {
    return (await this.#client).logout();
  }
}
