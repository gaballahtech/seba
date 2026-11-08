/**
 * Public and internal types used across SEBA.
 *
 * The public surface is intentionally small: {@link SebaConfig}, {@link LoginOptions},
 * {@link Session}, and the value types below that appear in the API documentation.
 */

/** Where SEBA stores session secrets. */
export type StorageKind = "indexeddb" | "memory";

/**
 * Configuration for the {@link Seba} class.
 *
 * @example
 * ```ts
 * const config: SebaConfig = {
 *   clientId: "https://myapp.example/client-id.jsonld",
 *   redirectUri: "https://myapp.example/auth/callback",
 * };
 * ```
 */
export interface SebaConfig {
  /**
   * Absolute HTTPS URL of the application's published Solid Client ID Document.
   * This URL is sent to the identity provider as the OAuth `client_id`.
   */
  clientId: string;

  /**
   * Absolute URL the identity provider redirects back to. Must appear verbatim in
   * the Client ID Document's `redirect_uris`. In Node.js it must point at a loopback
   * interface (`http://127.0.0.1:<port>/<path>` or `http://localhost:<port>/<path>`).
   */
  redirectUri: string;

  /**
   * Session storage backend. Defaults to `"indexeddb"` in browsers and
   * `"memory"` in Node.js.
   *
   * `"indexeddb"` persists the refresh token, the DPoP private key and non-secret
   * session metadata. If the provider issues no refresh token, the access token is
   * persisted as well (soft-persist) so a reload can resume the session until it
   * expires; refresh-token sessions never persist an access token.
   */
  storage?: StorageKind;

  /**
   * Emit non-sensitive diagnostics through `console.debug`. Tokens, keys,
   * authorization codes and PKCE verifiers are never logged.
   *
   * @defaultValue `false`
   */
  debug?: boolean;

  /**
   * Node.js only. Receives the authorization URL during an interactive login so
   * the application can open it in a browser or print it for the user.
   *
   * Without this hook Node.js cannot complete an interactive login and
   * {@link Seba.login} throws a `SebaNoUIError`.
   */
  openAuthorizationUrl?: (url: string) => void | Promise<void>;

  /**
   * Opt-in escape hatch for non-compliant Solid providers (see Security guide).
   *
   * Solid-OIDC §8.1 requires `"solid"` in the ID token `aud` claim when the provider
   * advertises the `webid` scope. Some real-world providers (e.g. `solidcommunity.net`)
   * issue `aud` as a plain string without `"solid"`. When `true`, Seba accepts such
   * tokens, but only the `"solid"` audience requirement is relaxed — signature
   * verification, `iss`, `exp`/`iat`, `nonce`, `cnf.jkt` and the `client_id` audience
   * check are all still enforced.
   *
   * @default false
   * @example
   * ```ts
   * const seba = new Seba({
   *   clientId: "...",
   *   redirectUri: "...",
   *   allowNonCompliantAudience: true, // only for known-broken providers
   * });
   * ```
   */
  allowNonCompliantAudience?: boolean;

  /**
   * Opt-in escape hatch for non-compliant Solid providers (see Security guide).
   *
   * Solid-OIDC §8.1 requires the ID token to carry a `cnf` claim with a `jkt` member
   * binding it to the DPoP key when the provider advertises the `webid` scope. Some
   * real-world providers (e.g. `solidcommunity.net`) omit `cnf.jkt` from the ID token
   * while still issuing DPoP-bound access tokens. When `true`, the `cnf.jkt` presence
   * requirement is relaxed for such ID tokens — everything else stays enforced: DPoP
   * proofs are still signed and required on every request, an ID token that DOES carry
   * `cnf.jkt` is still checked against the session key, and signature verification,
   * `iss`, `exp`/`iat`, `nonce`, `azp` and the `client_id` audience check all remain on.
   *
   * @default false
   */
  allowNonCompliantCnf?: boolean;

  /**
   * Compliance relaxations keyed by provider issuer URL, applied only when the login
   * targets that exact issuer (compared after normalizing an optional trailing slash).
   * Entries override the global boolean flags for that provider, and providers NOT
   * listed keep full strict validation — prefer this over the global flags whenever
   * the application talks to more than one provider.
   *
   * @example
   * ```ts
   * tolerances: {
   *   "https://solidcommunity.net/": { allowNonCompliantAudience: true, allowNonCompliantCnf: true },
   * }
   * ```
   */
  tolerances?: Record<string, ComplianceTolerances>;

  /**
   * How many `use_dpop_nonce` challenges the token endpoint may issue before SEBA
   * gives up. Each retry signs a brand-new DPoP proof with the fresh nonce. The
   * resource-fetch path applies the same count. Providers that rotate nonces on
   * every request benefit from 2–3.
   *
   * @defaultValue 1
   */
  maxDpopNonceRetries?: number;

  /**
   * Controls persistence when the provider issues no refresh token.
   *
   * - `\"auto\"` (default): stores the access token + DPoP key (soft-persist) so a
   *   page reload can resume the session until the access token expires.
   * - `\"never\"`: keeps such sessions in memory only (higher privacy; no reload survival).
   *
   * Sessions with a refresh token are unaffected: refresh tokens/keys are persisted
   * as before, and access tokens are never persisted.
   */
  persistSessionWithoutRefreshToken?: "auto" | "never";

  /**
   * Storage namespace enabling more than one concurrent session in the same browser
   * profile (multi-account). Each distinct account value gets its own IndexedDB
   * database (`seba:<account>`) and sessionStorage transaction key, so two `Seba`
   * instances with different accounts do not overwrite each other. Node.js sessions
   * are already per-instance in memory.
   *
   * @defaultValue undefined (single unnamed session, as in earlier releases)
   */
  account?: string;
}

/** Relaxations for a single provider, used by {@link SebaConfig.tolerances}. */
export interface ComplianceTolerances {
  /** Relax the `"solid"` ID-token audience requirement for this provider. */
  allowNonCompliantAudience?: boolean;
  /** Relax the `cnf.jkt` presence requirement on this provider's ID tokens. */
  allowNonCompliantCnf?: boolean;
}

/** Token-free snapshot of session state, safe to render or log. */
export interface SessionInfo {
  webId: string;
  provider: string;
  /** Access token expiry (epoch milliseconds), or `null` when unknown. */
  accessTokenExpiresAt: number | null;
}

/** Optional identity hints for {@link Seba.login}. */
export interface LoginOptions {
  /** WebID whose profile lists the trusted identity provider. */
  webId?: string;
  /** Identity provider issuer URL, used instead of WebID discovery. */
  issuer?: string;
}

/**
 * A validated, authenticated Solid session.
 *
 * The session object contains no tokens; `Seba.fetch` uses them internally.
 */
export interface Session {
  /** WebID proven by the validated ID token. */
  webId: string;
  /** Discriminant that is always `true` for an authenticated session. */
  isLoggedIn: true;
  /** Identity provider issuer URL that was validated for this session. */
  provider: string;
}

/** Why a session changed. */
export type SessionChangeReason = "login" | "logout" | "restore" | "expired";

/**
 * Emitted after every session transition.
 *
 * `expired` fires at most once per session, the first time SEBA determines that the
 * session cannot continue (revoked grant, expired stored token with no refresh token,
 * or an access token rejected with no way to renew it). It is also emitted with
 * `session: null`.
 */
export interface SessionChangeEvent {
  /** Transition that just happened. */
  readonly reason: SessionChangeReason;
  /** Session after the transition, or `null` after logout/expiry. */
  readonly session: Session | null;
}

/** Listener accepted by `onSessionChange`. */
export type SessionChangeListener = (event: SessionChangeEvent) => void;

/**
 * A token response that passed validation.
 *
 * Access tokens are never exposed by the public API. They stay in memory, except
 * when the provider issues no refresh token: then the access token is persisted so
 * a reload can resume the session until it expires.
 */
export interface TokenSet {
  /** DPoP-bound access token. In memory only. */
  accessToken: string;
  /** Token type. SEBA fails closed unless the provider returns `DPoP`. */
  tokenType: "DPoP";
  /** Validated OIDC ID token. */
  idToken: string;
  /** Refresh token, when the provider issued one (`offline_access`). */
  refreshToken?: string;
  /** Access token lifetime in seconds, when advertised. */
  expiresIn?: number;
  /** Granted scopes, when advertised. */
  scope?: string;
}

/** A freshly generated DPoP proof. One proof is created per HTTP request. */
export interface DPoPProof {
  /** Compact-serialized, ES256-signed `dpop+jwt`. */
  jwt: string;
}

/**
 * DPoP signing capability used by the protocol modules.
 *
 * Implemented by `core/dpop.ts`. Every call to {@link DPoPSigner.createProof} must sign a
 * brand-new proof: implementations are forbidden from caching or reusing proofs.
 */
export interface DPoPSigner {
  /** Create a fresh proof for one HTTP attempt. */
  createProof(input: ProofInput): Promise<string>;
  /** Base64url JWK SHA-256 thumbprint of the signing key. */
  thumbprint(): Promise<string>;
}

/** Input for one DPoP proof. */
export interface ProofInput {
  /** HTTP method of the request being made, in uppercase. */
  readonly method: string;
  /** Absolute target URL; query and fragment are removed before signing. */
  readonly url: string;
  /** Access token being presented (protected-resource requests only). */
  readonly accessToken?: string;
  /** Server-provided `DPoP-Nonce`, when one is known. */
  readonly nonce?: string;
}

/** The subset of OpenID Provider metadata SEBA relies on. */
export interface OIDCConfiguration {
  /** Validated issuer identifier (matches the requested issuer). */
  issuer: string;
  /** Authorization endpoint, absolute HTTPS URL. */
  authorizationEndpoint: string;
  /** Token endpoint, absolute HTTPS URL. */
  tokenEndpoint: string;
  /** JWKS endpoint, absolute HTTPS URL. */
  jwksUri: string;
  /** Token revocation endpoint, when advertised. */
  revocationEndpoint?: string;
  /** DPoP signing algorithms advertised by the provider, when present. */
  dpopSigningAlgValuesSupported?: string[];
  /** Scopes advertised by the provider, when present. */
  scopesSupported?: string[];
  /** Grant types advertised by the provider, when present. */
  grantTypesSupported?: string[];
  /**
   * Opt-in escape hatch for non-compliant Solid providers (see SECURITY.md).
   *
   * When `true`, the `"solid"` requirement in the ID token `aud` claim is relaxed for
   * providers that violate Solid-OIDC §8.1 (e.g. `solidcommunity.net`). Everything else
   * stays enforced: signature, `iss`, `exp`/`iat`, `nonce`, `cnf.jkt`, and the
   * `client_id` audience check. Default `false`.
   */
  allowNonCompliantAudience?: boolean;

  /**
   * Opt-in escape hatch for non-compliant Solid providers (see SECURITY.md).
   *
   * When `true`, the `cnf.jkt` presence requirement on the ID token is relaxed for
   * providers whose ID tokens carry no DPoP binding while the provider still issues
   * DPoP-bound access tokens (e.g. `solidcommunity.net`). DPoP proofs remain mandatory
   * on every request, an ID token that DOES carry `cnf.jkt` is still checked against
   * the session key, and signature, `iss`, `exp`/`iat`, `nonce` and the `client_id`
   * audience check all stay enforced. Default `false`.
   */
  allowNonCompliantCnf?: boolean;
}

/** A validated Solid Client ID Document. */
export interface ClientIDDocument {
  /** The `client_id` member; must equal the document URL. */
  clientId: string;
  /** Published redirect URIs. Membership is compared exactly. */
  redirectUris: string[];
  /** Human readable client name, when published. */
  clientName?: string;
}

/** DPoP private key as stored for session restoration. */
export type PersistedKey =
  | {
      /** Non-extractable `CryptoKey` stored through structured clone (preferred). */
      kind: "crypto-key";
      key: CryptoKey;
      /**
       * Public half of the stored key.
       *
       * A non-extractable private `CryptoKey` cannot reproduce its public key through
       * Web Crypto, so the public JWK (which contains no private material) is stored
       * alongside it for the DPoP proof header and the JWK thumbprint.
       */
      publicJwk: JsonWebKey;
    }
  | {
      /** Exported JWK fallback for runtimes that cannot structured-clone CryptoKeys. */
      kind: "jwk";
      jwk: JsonWebKey;
    };

/**
 * Non-secret session metadata plus the two secrets that must survive a reload:
 * the refresh token and the DPoP private key.
 *
 * Access tokens are deliberately absent from this record.
 */
export interface PersistedSession {
  /** Storage schema version. */
  version: 1;
  /** Validated WebID. */
  webId: string;
  /** Validated identity provider issuer. */
  provider: string;
  /** Client identifier the session was created for. */
  clientId: string;
  /** Refresh token, when the provider issued one. */
  refreshToken?: string;
  /**
   * Access token, stored only when the provider issued no refresh token so that
   * {@link Seba.restoreSession} can resume the session until it expires.
   */
  accessToken?: string;
  /** Expiry of the stored access token (epoch ms), or `null` when unknown. */
  accessTokenExpiresAt?: number | null;
  /** `sub` claim, when known. */
  subject?: string;
  /** DPoP private key bound to the refresh token. */
  key: PersistedKey;
  /** Granted scopes, when known. */
  scope?: string;
  /** Creation time (epoch milliseconds) for diagnostics. */
  createdAt: number;
}

/** Persistence backend for {@link PersistedSession}. */
export interface SessionStorageAdapter {
  /** Durably write the session record. */
  save(session: PersistedSession): Promise<void>;
  /** Read the session record, or `null` when none exists. */
  load(): Promise<PersistedSession | null>;
  /** Remove the session record. Must not throw when nothing is stored. */
  clear(): Promise<void>;
}

/**
 * Short-lived authorization transaction state.
 *
 * Contains the PKCE verifier and expected nonce, so it is kept in
 * `sessionStorage` (browser) or process memory (Node.js) — never in
 * `localStorage` and never in a URL.
 */
export interface PendingAuthorization {
  /** OAuth `state` sent with the authorization request. */
  state: string;
  /** PKCE `code_verifier`. */
  codeVerifier: string;
  /** Expected OIDC `nonce`. */
  nonce: string;
  /** Issuer the user is being sent to (RFC 9207 `iss` validation target). */
  issuer: string;
  /** Client identifier used for the request. */
  clientId: string;
  /** Redirect URI used for the request. */
  redirectUri: string;
  /** WebID the user asked to sign in with, when known. */
  webId?: string;
  /** Creation time (epoch milliseconds); stale transactions are discarded. */
  createdAt: number;
}

/** Persistence for {@link PendingAuthorization}. */
export interface PendingAuthorizationStore {
  save(pending: PendingAuthorization): Promise<void>;
  load(): Promise<PendingAuthorization | null>;
  clear(): Promise<void>;
}

/** Runtime capabilities the core code needs from its host. */
export interface Platform {
  /** Runtime name, used for defaults and error messages. */
  readonly kind: "browser" | "node";
  /** Storage backend used when the configuration does not force one. */
  readonly defaultStorage: StorageKind;
  /**
   * Runtime-specific `fetch` implementation used for provider and resource requests.
   *
   * Injected so Node.js can apply its own timeout/error mapping without touching DOM
   * globals, and so tests can supply a deterministic implementation.
   */
  readonly fetch: typeof fetch;
  /** Current document URL, or `null` when there is no document context. */
  currentUrl(): URL | null;
  /** Short-lived authorization transaction storage. */
  readonly pendingAuth: PendingAuthorizationStore;
  /**
   * Perform the interactive step and resolve with the authorization response URL.
   *
   * Browsers navigate away, so the returned promise intentionally never settles.
   * Node.js resolves it from the temporary loopback callback server.
   */
  beginInteractiveLogin(request: InteractiveLoginRequest): Promise<URL>;
  /** Ask the user for a WebID or issuer. Missing outside the browser. */
  selectIdentity?(): Promise<LoginOptions>;
  /** Create a session storage adapter for the requested backend. */
  createStorage(kind: StorageKind): SessionStorageAdapter;
  /**
   * Remove authorization response parameters from the visible URL after they have been
   * consumed. Browsers implement this with `history.replaceState`; Node.js has no URL.
   */
  clearCallback?(): void;
}

/** Input for {@link Platform.beginInteractiveLogin}. */
export interface InteractiveLoginRequest {
  /** Fully constructed authorization URL. */
  authorizationUrl: string;
  /** Redirect URI registered with the provider. */
  redirectUri: string;
  /** Expected OAuth state, used by the loopback server to ignore stray requests. */
  state: string;
  /** Open the authorization URL in a browser. Node.js only. */
  openAuthorizationUrl?: (url: string) => void | Promise<void>;
}
