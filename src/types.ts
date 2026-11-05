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
   * `"indexeddb"` persists only the refresh token, the DPoP private key and
   * non-secret session metadata. Access tokens are never persisted.
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

/**
 * A token response that passed validation.
 *
 * Access tokens are held in memory only — never persisted or exposed by the
 * public API.
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
  /** Refresh token. Never an access token. */
  refreshToken: string;
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
