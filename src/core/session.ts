/**
 * Session lifecycle: in-memory token state, durable refresh-token storage, restoration
 * and logout.
 *
 * Invariants:
 * - access tokens and ID tokens live in memory only;
 * - the refresh token and DPoP key are the only secrets written to storage;
 * - a rejected refresh token clears the local session and surfaces
 *   {@link SebaSessionExpiredError};
 * - transient failures never clear a still-valid refresh token.
 */

import { loadDPoPKey } from "./dpop.js";
import { SebaAuthError, SebaConfigError, SebaNetworkError, SebaSessionExpiredError } from "./errors.js";
import { httpFetch } from "./http.js";
import { parseTokenSet, requestTokenResponse, validateIdToken, type Identity } from "./oidc.js";
import type {
  DPoPSigner,
  OIDCConfiguration,
  PersistedKey,
  PersistedSession,
  Session,
  SessionChangeListener,
  SessionChangeReason,
  SessionStorageAdapter,
  TokenSet,
} from "../types.js";

/** Refresh an access token this long before it expires (milliseconds). */
export const EXPIRY_SKEW_MS = 30_000;

/** OAuth errors that mean the stored grant is permanently unusable. */
const TERMINAL_REFRESH_ERRORS = new Set(["invalid_grant", "invalid_token", "invalid_request", "unauthorized_client"]);

/** A logged in session held in memory. */
export interface SessionState {
  /** Current tokens. Replaced on refresh; never persisted. */
  readonly tokens: TokenSet;
  /** Identity proven by the validated ID token. */
  readonly identity: Identity;
  /** DPoP signing capability for this session. */
  readonly signer: DPoPSigner;
  /** Stored form of the DPoP key, reused when refreshing. */
  readonly key: PersistedKey;
  /** Client identifier the session belongs to. */
  readonly clientId: string;
  /** Discovery metadata used for refresh and revocation; `null` for sessions resumed without discovery. */
  readonly configuration: OIDCConfiguration | null;
  /** Access token expiry (epoch milliseconds), or `null` when unknown. */
  readonly expiresAt: number | null;
}

/** Options for {@link SessionManager}. */
export interface SessionManagerOptions {
  /** Client identifier used by every request in this session. */
  readonly clientId: string;
  /** Durable refresh-token storage. */
  readonly storage: SessionStorageAdapter;
  /** Runtime fetch implementation. */
  readonly fetchImpl: typeof fetch;
  /** Re-discover a provider when restoring a session. */
  readonly discover: (issuer: string) => Promise<OIDCConfiguration>;
  /**
   * How many `use_dpop_nonce` challenges the token endpoint may issue before giving up.
   * @defaultValue 1
   */
  readonly maxDpopNonceRetries?: number;
  /** Non-sensitive diagnostics. */
  readonly debug?: (message: string) => void;
  /** Receives session transitions (`login`, `restore`, `logout`, `expired`). */
  readonly onSessionChange?: SessionChangeListener;
}

/**
 * Owns the current session and its persistence.
 *
 * Obtained internally from `Seba`; not exported from the package entry point.
 */
export class SessionManager {
  readonly #options: SessionManagerOptions;
  #state: SessionState | null = null;
  #refreshing: Promise<void> | null = null;
  #expiredNotified = false;

  constructor(options: SessionManagerOptions) {
    this.#options = options;
  }

  /** Current session state, or `null` when logged out. */
  get current(): SessionState | null {
    return this.#state;
  }

  /** Whether a session is present in memory. */
  get isAuthenticated(): boolean {
    return this.#state !== null;
  }

  /**
   * Current session state.
   *
   * @throws {@link SebaAuthError} when no session exists.
   */
  require(): SessionState {
    if (this.#state === null) {
      throw new SebaAuthError("No authenticated session. Call login() or restoreSession() first.");
    }
    return this.#state;
  }

  /** Public, token-free view of the current session. */
  toPublicSession(): Session | null {
    if (this.#state === null) {
      return null;
    }
    return { webId: this.#state.identity.webId, isLoggedIn: true, provider: this.#state.identity.issuer };
  }

  /**
   * Adopt a freshly logged in session.
   *
   * Persists the refresh token and DPoP key when the provider issued a refresh token.
   * Storage failures are downgraded to a debug message: the in-memory session stays
   * usable, only reload survival is affected.
   */
  async adopt(input: {
    tokens: TokenSet;
    identity: Identity;
    signer: DPoPSigner;
    key: PersistedKey;
    configuration: OIDCConfiguration;
  }): Promise<SessionState> {
    const state: SessionState = {
      tokens: input.tokens,
      identity: input.identity,
      signer: input.signer,
      key: input.key,
      clientId: this.#options.clientId,
      configuration: input.configuration,
      expiresAt: expiresAtFrom(input.tokens),
    };
    this.#state = state;

    const noRefreshToken = input.tokens.refreshToken === undefined;
    const record: PersistedSession = {
      version: 1,
      webId: state.identity.webId,
      provider: state.identity.issuer,
      clientId: state.clientId,
      ...(noRefreshToken
        ? {
            // With no refresh token there is nothing else to fetch with after a
            // reload, so the access token is stored to keep the session alive
            // until it expires. It is never stored for refresh-token sessions.
            accessToken: input.tokens.accessToken,
            accessTokenExpiresAt: state.expiresAt,
            subject: input.identity.subject,
          }
        : {}),
      ...(noRefreshToken ? {} : { refreshToken: input.tokens.refreshToken }),
      key: input.key,
      createdAt: Date.now(),
      ...(input.tokens.scope === undefined ? {} : { scope: input.tokens.scope }),
    };
    try {
      await this.#options.storage.save(record);
    } catch (error) {
      this.#log("session storage is unavailable; the session will not survive a reload", error);
    }
    if (noRefreshToken) {
      this.#log(
        "the provider issued no refresh token; the session is stored with its access token and expires when the token does",
      );
    }
    this.#expiredNotified = false;
    this.#emit("login");
    return state;
  }

  /**
   * Restore a stored session by refreshing its access token.
   *
   * @returns The session, or `null` when nothing is stored.
   * @throws {@link SebaSessionExpiredError} when the grant was revoked (local state cleared).
   * @throws {@link SebaNetworkError} for transport and 5xx failures (local state kept).
   * @throws {@link SebaAuthError} for other provider rejections (local state kept).
   */
  async restore(): Promise<Session | null> {
    const record = await this.#options.storage.load();
    if (record === null) {
      return null;
    }
    if (record.version !== 1 || record.clientId !== this.#options.clientId) {
      await this.clearLocal();
      throw new SebaAuthError(
        "The stored session was created by a different SEBA configuration and cannot be reused.",
      );
    }

    let signer: DPoPSigner;
    try {
      signer = await loadDPoPKey(record.key);
    } catch (error) {
      await this.clearLocal();
      this.#signalExpired();
      throw new SebaSessionExpiredError("The stored DPoP key is unusable; the session was cleared.", {
        cause: error,
      });
    }

    if (record.refreshToken === undefined) {
      return this.#restoreWithoutRefreshToken(record, signer);
    }

    const configuration = await this.#options.discover(record.provider);
    await this.#refreshWith(record, signer, configuration);
    this.#expiredNotified = false;
    this.#emit("restore");
    return this.toPublicSession();
  }

  /**
   * Resume a session stored without a refresh token. The stored access token is
   * reused while it is still valid; once it expires the record is cleared with a
   * clear error because nothing on disk can renew it.
   */
  async #restoreWithoutRefreshToken(
    record: PersistedSession,
    signer: DPoPSigner,
  ): Promise<Session | null> {
    if (record.accessToken === undefined || record.accessToken === "") {
      await this.clearLocal();
      this.#signalExpired();
      throw new SebaSessionExpiredError(
        "The stored session has no usable credential; it was cleared. Sign in again.",
      );
    }
    if (
      record.accessTokenExpiresAt !== undefined &&
      record.accessTokenExpiresAt !== null &&
      Date.now() >= record.accessTokenExpiresAt - EXPIRY_SKEW_MS
    ) {
      await this.clearLocal();
      this.#signalExpired();
      throw new SebaSessionExpiredError(
        "The stored access token has expired and the provider issued no refresh token, so the session was cleared. Sign in again.",
      );
    }
    const tokens: TokenSet = {
      // Only the access token matters here: sessions restored without a refresh
      // token cannot refresh, so idToken is never read on this path.
      tokenType: "DPoP",
      accessToken: record.accessToken,
      idToken: "",
      ...(record.scope === undefined ? {} : { scope: record.scope }),
    };
    this.#state = {
      tokens,
      identity: { webId: record.webId, issuer: record.provider, subject: record.subject ?? record.webId },
      signer,
      key: record.key,
      clientId: this.#options.clientId,
      configuration: null,
      expiresAt: record.accessTokenExpiresAt ?? null,
    };
    this.#log(
      "restored the session with the stored access token (the provider issued no refresh token; it expires with the token)",
    );
    this.#expiredNotified = false;
    this.#emit("restore");
    return this.toPublicSession();
  }

  /** Access token expiry, or `null` when the provider did not advertise one. */
  get expiresAt(): number | null {
    return this.#state?.expiresAt ?? null;
  }

  /**
   * Refresh the current session unless the access token is still fresh.
   *
   * @param force - Refresh even when the token has not expired (used after a 401).
   * @throws {@link SebaAuthError} when no session exists.
   */
  async refreshIfNeeded(force = false): Promise<void> {
    if (this.#state === null && this.#expiredNotified) {
      throw new SebaSessionExpiredError("The session has expired. Sign in again.");
    }
    const state = this.require();
    if (state.tokens.refreshToken === undefined) {
      if (force) {
        await this.clearLocal();
        this.#signalExpired();
        throw new SebaSessionExpiredError(
          "The access token was rejected and no refresh token is available. Sign in again.",
        );
      }
      return;
    }
    if (!force && state.expiresAt !== null && Date.now() < state.expiresAt - EXPIRY_SKEW_MS) {
      return;
    }
    await this.#refreshOnce();
  }

  async #refreshOnce(): Promise<void> {
    if (this.#refreshing !== null) {
      await this.#refreshing;
      return;
    }
    const run = this.#performRefresh();
    this.#refreshing = run;
    try {
      await run;
    } finally {
      this.#refreshing = null;
    }
  }

  async #performRefresh(): Promise<void> {
    const state = this.require();
    const record = await this.#options.storage.load();
    const refreshToken = state.tokens.refreshToken ?? record?.refreshToken;
    if (refreshToken === undefined) {
      await this.clearLocal();
      this.#signalExpired();
      throw new SebaSessionExpiredError("No refresh token is available. Sign in again.");
    }
    if (state.configuration === null) {
      await this.clearLocal();
      this.#signalExpired();
      throw new SebaSessionExpiredError("No provider metadata is available for this session. Sign in again.");
    }
    const stored: PersistedSession = record ?? {
      version: 1,
      webId: state.identity.webId,
      provider: state.identity.issuer,
      clientId: state.clientId,
      refreshToken,
      key: state.key,
      createdAt: Date.now(),
    };
    await this.#refreshWith(stored, state.signer, state.configuration);
  }

  async #refreshWith(
    record: PersistedSession,
    signer: DPoPSigner,
    configuration: OIDCConfiguration,
  ): Promise<void> {
    if (record.refreshToken === undefined) {
      throw new SebaSessionExpiredError("No refresh token is available. Sign in again.");
    }
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: record.refreshToken,
      client_id: this.#options.clientId,
    });

    const outcome = await requestTokenResponse({
      tokenEndpoint: configuration.tokenEndpoint,
      body,
      signer,
      fetchImpl: this.#options.fetchImpl,
      maxNonceRetries: this.#options.maxDpopNonceRetries,
    });

    if (!outcome.ok) {
      if (outcome.status >= 500) {
        throw new SebaNetworkError(
          `The token endpoint is unavailable (HTTP ${String(outcome.status)}). The stored session was kept; try again later.`,
        );
      }
      if (TERMINAL_REFRESH_ERRORS.has(outcome.error)) {
        await this.clearLocal();
        this.#signalExpired();
        throw new SebaSessionExpiredError(
          `The stored session is no longer valid ("${outcome.error}"). Sign in again.`,
        );
      }
      throw new SebaAuthError(
        `The token endpoint rejected the refresh request with "${outcome.error}"` +
          (outcome.description === undefined ? "." : `: ${outcome.description}`),
      );
    }

    const tokens = parseTokenSet(outcome.body);
    let identity: Identity;
    try {
      identity = await validateIdToken({
        idToken: tokens.idToken,
        configuration,
        clientId: this.#options.clientId,
        signer,
        fetchImpl: this.#options.fetchImpl,
        requireDpopBinding: configuration.scopesSupported?.includes("webid") === true,
        ...(configuration.allowNonCompliantCnf === true ? { allowNonCompliantCnf: true } : {}),
        expectedWebId: record.webId,
      });
    } catch (error) {
      if (error instanceof SebaAuthError) {
        // A refresh whose ID token cannot be validated for this stored identity is
        // terminal: retrying the same grant cannot succeed, and keeping the record would
        // repeat the failure on every restore. Network/JWKS transport errors are not
        // SebaAuthError and keep the record.
        await this.clearLocal();
        this.#signalExpired();
        throw new SebaSessionExpiredError(
          "The refreshed ID token does not match the stored session, so the session was cleared. Sign in again.",
          { cause: error },
        );
      }
      throw error;
    }
    if (tokens.refreshToken === undefined) {
      tokens.refreshToken = record.refreshToken;
    }

    this.#state = {
      tokens,
      identity,
      signer,
      key: record.key,
      clientId: this.#options.clientId,
      configuration,
      expiresAt: expiresAtFrom(tokens),
    };

    if (tokens.refreshToken !== record.refreshToken || tokens.scope !== record.scope) {
      try {
        await this.#options.storage.save({
          ...record,
          refreshToken: tokens.refreshToken,
          ...(tokens.scope === undefined ? {} : { scope: tokens.scope }),
        });
      } catch (error) {
        this.#log("rotated refresh token could not be stored", error);
      }
    }
  }

  /**
   * Sign out.
   *
   * Revokes the refresh token when the provider advertises a revocation endpoint, then
   * clears local state. Revocation failures are best effort and never block logout.
   */
  async logout(): Promise<void> {
    const state = this.#state;
    const record = await this.#options.storage.load().catch(() => null);
    const refreshToken = state?.tokens.refreshToken ?? record?.refreshToken;
    let configuration = state?.configuration;
    let signer = state?.signer;

    if (
      refreshToken !== undefined &&
      record !== null &&
      (configuration === undefined || configuration === null || signer === undefined)
    ) {
      try {
        configuration ??= await this.#options.discover(record.provider);
        signer ??= await loadDPoPKey(record.key);
      } catch (error) {
        this.#log("could not prepare token revocation; clearing local state anyway", error);
      }
    }

    await this.clearLocal();
    this.#emit("logout");

    if (refreshToken === undefined || configuration?.revocationEndpoint === undefined || signer === undefined) {
      if (refreshToken !== undefined && configuration?.revocationEndpoint === undefined) {
        this.#log(
          "the provider does not advertise a revocation endpoint; the refresh token remains " +
            "valid on the server until it expires (or is revoked out-of-band). Local state was cleared.",
        );
      }
      return;
    }
    try {
      const headers: Record<string, string> = {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      };
      try {
        headers["DPoP"] = await signer.createProof({
          method: "POST",
          url: configuration.revocationEndpoint,
        });
      } catch (error) {
        this.#log("could not create a DPoP proof for revocation", error);
      }
      await httpFetch(
        configuration.revocationEndpoint,
        {
          method: "POST",
          headers,
          body: new URLSearchParams({
            token: refreshToken,
            token_type_hint: "refresh_token",
            client_id: this.#options.clientId,
          }).toString(),
          redirect: "manual",
        },
        { fetchImpl: this.#options.fetchImpl },
      );
    } catch (error) {
      this.#log("refresh token revocation failed; local session was still cleared", error);
    }
  }

  /** Clear the in-memory session and the stored record. */
  async clearLocal(): Promise<void> {
    this.#state = null;
    try {
      await this.#options.storage.clear();
    } catch (error) {
      this.#log("stored session could not be removed", error);
    }
  }

  /** Whether the current access token is expired or within the refresh skew. */
  isExpired(): boolean {
    const state = this.#state;
    if (state === null) {
      return true;
    }
    return state.expiresAt !== null && Date.now() >= state.expiresAt - EXPIRY_SKEW_MS;
  }

  /** Emit a transition; listener failures never break the session flow. */
  #emit(reason: SessionChangeReason): void {
    const listener = this.#options.onSessionChange;
    if (listener === undefined) {
      return;
    }
    try {
      listener({ reason, session: this.toPublicSession() });
    } catch {
      // Application callbacks must not interrupt session handling.
    }
  }

  /**
   * Emit `expired` at most once per session.
   *
   * The in-memory session is dropped first so the event always carries
   * `session: null`, matching {@link SessionChangeEvent}.
   */
  #signalExpired(): void {
    if (this.#expiredNotified) {
      return;
    }
    this.#expiredNotified = true;
    this.#state = null;
    this.#emit("expired");
  }

  #log(message: string, error?: unknown): void {
    if (this.#options.debug === undefined) {
      return;
    }
    const detail = error instanceof Error ? `: ${error.message}` : "";
    this.#options.debug(`${message}${detail}`);
  }
}

function expiresAtFrom(tokens: TokenSet): number | null {
  return tokens.expiresIn === undefined ? null : Date.now() + tokens.expiresIn * 1000;
}

/**
 * Validate that a storage backend can hold the session record shape.
 *
 * @param kind - Requested backend.
 */
export function assertStorageKind(kind: string): asserts kind is "indexeddb" | "memory" {
  if (kind !== "indexeddb" && kind !== "memory") {
    throw new SebaConfigError(`Unknown storage backend "${kind}". Use "indexeddb" or "memory".`);
  }
}
