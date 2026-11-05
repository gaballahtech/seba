/**
 * The `Seba` facade: resolves the runtime platform, then forwards to the protocol engine.
 *
 * The platform module is imported dynamically so a browser bundle never includes the
 * Node.js HTTP server and vice versa.
 */

import { SebaClient } from "./core/client.js";
import type { LoginOptions, Platform, SebaConfig, Session } from "./types.js";

async function loadPlatform(): Promise<Platform> {
  const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";
  if (isBrowser) {
    const { createBrowserPlatform } = await import("./browser/platform.js");
    return createBrowserPlatform();
  }
  const { createNodePlatform } = await import("./node/platform.js");
  return createNodePlatform();
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

  /**
   * @param config - Client ID Document URL, redirect URI and optional storage settings.
   *   Configuration is validated when the first operation runs.
   */
  constructor(config: SebaConfig) {
    this.#client = loadPlatform().then((platform) => new SebaClient(config, platform));
  }

  /** Start or finish an interactive login. See {@link SebaClient.login}. */
  async login(options: LoginOptions = {}): Promise<Session> {
    return (await this.#client).login(options);
  }

  /** Restore a stored session, or `null` when none exists. */
  async restoreSession(): Promise<Session | null> {
    return (await this.#client).restoreSession();
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
