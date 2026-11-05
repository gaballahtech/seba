/**
 * Runtime-independent implementation of the four public operations.
 *
 * The platform object supplies storage, navigation, callback capture and `fetch`; this
 * class owns the protocol flow and the security decisions that must be identical in
 * every runtime.
 */

import { createDPoPKey } from "./dpop.js";
import { SebaAuthError, SebaConfigError, SebaNoUIError } from "./errors.js";
import { discoverProvider, isLoopbackHost } from "./discovery.js";
import { httpFetch, inputToString } from "./http.js";
import {
  assertRedirectUriPublished,
  discoverIssuerForWebId,
  loadClientIdDocument,
  validateClientIdUrl,
  validateWebId,
} from "./identity.js";
import {
  buildAuthorizationUrl,
  createPendingAuthorization,
  exchangeAuthorizationCode,
  parseAuthorizationResponse,
  pkceChallenge,
} from "./oidc.js";
import { SessionManager } from "./session.js";
import { assertStorageKind } from "./session.js";
import type { LoginOptions, Platform, SebaConfig, Session, StorageKind } from "../types.js";

/** HTTP statuses that carry a `Location` header. */
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/** Maximum same-origin redirects followed by {@link SebaClient.fetch}. */
const MAX_REDIRECTS = 5;

/** Hard cap on attempts per logical request (redirects, nonce and token refresh included). */
const MAX_ATTEMPTS = 8;

/** `RequestInit` extended with the Node.js streaming-body flag. */
interface BodyInitWithDuplex extends RequestInit {
  duplex?: "half";
}

/** Validated configuration held by a client instance. */
interface ResolvedConfig {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly storage: StorageKind;
  readonly debug: boolean;
  readonly openAuthorizationUrl?: (url: string) => void | Promise<void>;
}

/**
 * The protocol engine behind {@link Seba}.
 *
 * Obtained through `Seba`, which resolves the platform first. Not exported from the
 * package entry point.
 */
export class SebaClient {
  readonly #platform: Platform;
  readonly #config: ResolvedConfig;
  readonly #sessions: SessionManager;
  #nonce: string | null = null;

  constructor(config: SebaConfig, platform: Platform) {
    this.#platform = platform;
    this.#config = resolveConfig(config, platform);
    this.#sessions = new SessionManager({
      clientId: this.#config.clientId,
      storage: platform.createStorage(this.#config.storage),
      fetchImpl: platform.fetch,
      discover: (issuer) => discoverProvider(issuer, platform.fetch),
      debug: (message) => {
        this.#debug(message);
      },
    });
  }

  /** Current session, if any (token-free). */
  get session(): Session | null {
    return this.#sessions.toPublicSession();
  }

  /**
   * Sign in, or finish a sign-in that the provider redirected back to this application.
   *
   * When the current URL carries an authorization response, the stored transaction is
   * validated and the code is exchanged. Otherwise a new authorization request is
   * started: the returned promise resolves after the redirect in Node.js and never
   * settles in the browser (the page navigates away).
   */
  async login(options: LoginOptions = {}): Promise<Session> {
    const callbackUrl = this.#callbackUrl();
    if (callbackUrl !== null) {
      return this.#completeLogin(callbackUrl);
    }
    const existing = this.#sessions.toPublicSession();
    if (existing !== null) {
      return existing;
    }
    return this.#startLogin(options);
  }

  /**
   * Restore a previous session from storage.
   *
   * @returns The session, or `null` when nothing is stored.
   * @throws SebaSessionExpiredError when the stored grant was revoked (state cleared).
   */
  async restoreSession(): Promise<Session | null> {
    return this.#sessions.restore();
  }

  /**
   * Perform a DPoP-authenticated request.
   *
   * A fresh proof is created for every attempt. Same-origin redirects are followed with a
   * new proof per hop; cross-origin redirects are returned to the caller unchanged, so
   * credentials are never forwarded to another origin. One retry is allowed for a DPoP
   * nonce challenge and one for an expired access token; non-replayable bodies are never
   * resent.
   */
  async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    this.#sessions.require();
    if (this.#sessions.isExpired()) {
      await this.#sessions.refreshIfNeeded();
    }

    const template = buildTemplate(input, init);
    const replayable = isReplayable(input, init);
    const body: BodyInit | null =
      template.body === null ? null : replayable ? await readBody(template) : template.body;
    const origin = new URL(template.url).origin;
    let current: { url: string; method: string; headers: Headers } = {
      url: template.url,
      method: template.method,
      headers: new Headers(template.headers),
    };
    let redirects = 0;
    let nonceRetried = false;
    let tokenRetried = false;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      const state = this.#sessions.require();
      const accessToken = state.tokens.accessToken;
      const headers = new Headers(current.headers);
      headers.set("authorization", `DPoP ${accessToken}`);
      headers.set(
        "DPoP",
        await state.signer.createProof({
          method: current.method,
          url: current.url,
          accessToken,
          ...(this.#nonce === null ? {} : { nonce: this.#nonce }),
        }),
      );

      const response = await this.#send(current, headers, body, init?.signal ?? null);
      const nonce = response.headers.get("dpop-nonce");
      if (nonce !== null) {
        this.#nonce = nonce;
      }

      if (REDIRECT_STATUSES.has(response.status)) {
        const location = response.headers.get("location");
        const next = location === null ? null : safeResolve(location, current.url);
        if (next === null || next.origin !== origin || redirects >= MAX_REDIRECTS || !replayable) {
          return response;
        }
        redirects += 1;
        const method = downgradeToGet(response.status, current.method) ? "GET" : current.method;
        current = {
          url: next.href,
          method,
          headers: current.headers,
        };
        continue;
      }

      if (response.status === 400 || response.status === 401) {
        if (nonce !== null && !nonceRetried && replayable) {
          nonceRetried = true;
          continue;
        }
        if (response.status === 401 && !tokenRetried && replayable) {
          tokenRetried = true;
          await this.#sessions.refreshIfNeeded(true);
          continue;
        }
      }
      return response;
    }

    throw new SebaAuthError(
      "The request could not be completed after following redirects and retrying the DPoP nonce and access token. " +
        "Reduce the redirect chain or check that the resource server accepts the session's DPoP key.",
    );
  }

  /** Sign out, revoking the refresh token when the provider supports revocation. */
  async logout(): Promise<void> {
    await this.#sessions.logout();
  }

  async #send(
    request: { url: string; method: string; headers: Headers },
    headers: Headers,
    body: BodyInit | null,
    signal: AbortSignal | null,
  ): Promise<Response> {
    const init: BodyInitWithDuplex = {
      method: request.method,
      headers,
      redirect: "manual",
    };
    if (body !== null && request.method !== "GET" && request.method !== "HEAD") {
      init.body = body;
      if (body instanceof ReadableStream) {
        init.duplex = "half";
      }
    }
    return httpFetch(request.url, init, {
      fetchImpl: this.#platform.fetch,
      signal,
    });
  }

  async #startLogin(options: LoginOptions): Promise<Session> {
    let webId = options.webId === undefined ? undefined : validateWebId(options.webId).webId;
    let issuer = options.issuer;

    if (webId === undefined && issuer === undefined) {
      if (this.#platform.selectIdentity === undefined) {
        throw new SebaNoUIError(
          "No WebID or identity provider was provided and this runtime cannot ask the user. " +
            "Call login({ issuer }) or login({ webId }) in Node.js.",
        );
      }
      const chosen = await this.#platform.selectIdentity();
      webId = chosen.webId === undefined ? undefined : validateWebId(chosen.webId).webId;
      issuer = chosen.issuer;
    }

    if (issuer === undefined && webId !== undefined) {
      issuer = await discoverIssuerForWebId(webId, this.#platform.fetch);
    }
    if (issuer === undefined) {
      throw new SebaConfigError(
        "Login requires either a WebID or an identity provider issuer. Neither was provided.",
      );
    }

    const configuration = await discoverProvider(issuer, this.#platform.fetch);
    const document = await loadClientIdDocument(this.#config.clientId, this.#platform.fetch);
    assertRedirectUriPublished(document, this.#config.redirectUri);

    const pending = await createPendingAuthorization({
      issuer: configuration.issuer,
      clientId: this.#config.clientId,
      redirectUri: this.#config.redirectUri,
      ...(webId === undefined ? {} : { webId }),
    });
    const codeChallenge = await pkceChallenge(pending.codeVerifier);
    const authorizationUrl = buildAuthorizationUrl({
      configuration,
      clientId: this.#config.clientId,
      redirectUri: this.#config.redirectUri,
      state: pending.state,
      nonce: pending.nonce,
      codeChallenge,
    });

    await this.#platform.pendingAuth.save(pending);
    this.#debug(`starting authorization at ${describeEndpoint(configuration.authorizationEndpoint)}`);

    const responseUrl = await this.#platform.beginInteractiveLogin({
      authorizationUrl,
      redirectUri: this.#config.redirectUri,
      state: pending.state,
      ...(this.#config.openAuthorizationUrl === undefined
        ? {}
        : { openAuthorizationUrl: this.#config.openAuthorizationUrl }),
    });
    return this.#completeLogin(responseUrl.href);
  }

  async #completeLogin(callbackUrl: string): Promise<Session> {
    const pending = await this.#platform.pendingAuth.load();
    if (pending === null) {
      throw new SebaAuthError(
        "An authorization response was found in the URL, but no login is pending. " +
          "Start the login from this application; responses from other tabs or sessions are ignored.",
      );
    }
    if (pending.clientId !== this.#config.clientId || pending.redirectUri !== this.#config.redirectUri) {
      await this.#platform.pendingAuth.clear();
      throw new SebaAuthError(
        "The pending login was started for a different client or redirect URI. The response was ignored.",
      );
    }

    const code = parseAuthorizationResponse(callbackUrl, pending);
    const configuration = await discoverProvider(pending.issuer, this.#platform.fetch);
    const material = await createDPoPKey();
    const result = await exchangeAuthorizationCode({
      configuration,
      clientId: this.#config.clientId,
      redirectUri: this.#config.redirectUri,
      code,
      codeVerifier: pending.codeVerifier,
      nonce: pending.nonce,
      signer: material.signer,
      fetchImpl: this.#platform.fetch,
      ...(pending.webId === undefined ? {} : { expectedWebId: pending.webId }),
    });

    await this.#sessions.adopt({
      tokens: result.tokens,
      identity: result.identity,
      signer: material.signer,
      key: material.persisted,
      configuration,
    });
    await this.#platform.pendingAuth.clear();
    this.#platform.clearCallback?.();
    this.#debug(`authenticated as ${result.identity.webId}`);
    const session = this.#sessions.toPublicSession();
    if (session === null) {
      throw new SebaAuthError("The session was created but could not be read back.");
    }
    return session;
  }

  #callbackUrl(): string | null {
    const url = this.#platform.currentUrl();
    if (url === null) {
      return null;
    }
    const params = url.searchParams;
    if (!params.has("code") && !params.has("error")) {
      return null;
    }
    if (!params.has("state")) {
      return null;
    }
    let configured: URL;
    try {
      configured = new URL(this.#config.redirectUri);
    } catch {
      return null;
    }
    if (url.origin !== configured.origin || url.pathname !== configured.pathname) {
      return null;
    }
    return url.href;
  }

  #debug(message: string): void {
    if (!this.#config.debug) {
      return;
    }
    console.debug(`[seba] ${message}`);
  }
}

function resolveConfig(config: SebaConfig, platform: Platform): ResolvedConfig {
  const clientId = validateClientIdUrl(config.clientId);

  let redirect: URL;
  try {
    redirect = new URL(config.redirectUri);
  } catch {
    throw new SebaConfigError(
      `The redirectUri "${config.redirectUri}" is not an absolute URL. ` +
        'Use the callback URL published in your Client ID Document, for example "https://app.example/auth/callback".',
    );
  }
  if (redirect.protocol !== "https:" && !(redirect.protocol === "http:" && isLoopbackHost(redirect.hostname))) {
    throw new SebaConfigError(
      `The redirectUri "${config.redirectUri}" must use https. ` +
        "Plain http is only accepted for loopback development hosts.",
    );
  }
  if (platform.kind === "node" && !isLoopbackHost(redirect.hostname)) {
    throw new SebaConfigError(
      `In Node.js the redirectUri must point at a loopback interface (127.0.0.1, ::1 or localhost), ` +
        `but "${config.redirectUri}" does not. The temporary callback server only listens on loopback.`,
    );
  }

  const storage = config.storage ?? platform.defaultStorage;
  assertStorageKind(storage);

  return {
    clientId,
    redirectUri: config.redirectUri,
    storage,
    debug: config.debug === true,
    ...(config.openAuthorizationUrl === undefined ? {} : { openAuthorizationUrl: config.openAuthorizationUrl }),
  };
}

function buildTemplate(input: RequestInfo | URL, init: RequestInit | undefined): Request {
  try {
    return new Request(input, init);
  } catch (error) {
    throw new SebaConfigError(
      `The request for "${safeDescribe(inputToString(input))}" could not be constructed. ` +
        "Use an absolute URL and a body type accepted by fetch.",
      { cause: error },
    );
  }
}

function isReplayable(input: RequestInfo | URL, init: RequestInit | undefined): boolean {
  if (init?.body instanceof ReadableStream) {
    return false;
  }
  if (input instanceof Request && input.body !== null) {
    return false;
  }
  return true;
}

async function readBody(request: Request): Promise<ArrayBuffer> {
  try {
    return await request.arrayBuffer();
  } catch (error) {
    throw new SebaConfigError("The request body could not be read.", { cause: error });
  }
}

function downgradeToGet(status: number, method: string): boolean {
  if (status === 303) {
    return true;
  }
  return (status === 301 || status === 302) && method === "POST";
}

function safeResolve(location: string, base: string): URL | null {
  try {
    return new URL(location, base);
  } catch {
    return null;
  }
}

function safeDescribe(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return "the request URL";
  }
}

function describeEndpoint(value: string): string {
  return safeDescribe(value);
}
