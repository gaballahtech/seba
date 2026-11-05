/**
 * Stable error codes exposed by SEBA.
 *
 * Every error thrown by the library is a {@link SebaError} carrying one of these
 * codes, so applications can branch on `error.code` instead of matching strings.
 */
export type SebaErrorCode =
  | "SEBA_ERR_CONFIG"
  | "SEBA_ERR_DISCOVERY"
  | "SEBA_ERR_REDIRECT_MISMATCH"
  | "SEBA_ERR_AUTH"
  | "SEBA_ERR_SESSION_EXPIRED"
  | "SEBA_ERR_DPOP"
  | "SEBA_ERR_NETWORK"
  | "SEBA_ERR_NO_UI";

/** Options accepted by every SEBA error. */
export interface SebaErrorOptions {
  /** Underlying error, kept for diagnostics. Never used to carry secrets. */
  cause?: unknown;
}

/**
 * Base class of every error thrown by SEBA.
 *
 * @example
 * ```ts
 * try {
 *   await seba.login();
 * } catch (error) {
 *   if (error instanceof SebaError) console.error(error.code, error.message);
 * }
 * ```
 */
export class SebaError extends Error {
  /** Stable, machine-readable error code. */
  readonly code: SebaErrorCode;

  constructor(code: SebaErrorCode, message: string, options?: SebaErrorOptions) {
    super(message, options?.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
  }
}

/** Invalid, missing or contradictory library configuration. */
export class SebaConfigError extends SebaError {
  constructor(message: string, options?: SebaErrorOptions) {
    super("SEBA_ERR_CONFIG", message, options);
  }
}

/** WebID, Client ID Document or OpenID Provider discovery failed. */
export class SebaDiscoveryError extends SebaError {
  constructor(message: string, options?: SebaErrorOptions) {
    super("SEBA_ERR_DISCOVERY", message, options);
  }
}

/**
 * The configured redirect URI is not published by the Client ID Document.
 *
 * The message lists both the requested URI and the published URIs so the
 * mismatch can be fixed without inspecting network traffic.
 */
export class SebaRedirectMismatchError extends SebaError {
  /** Redirect URI requested by the application. */
  readonly requestedRedirectUri: string;
  /** Redirect URIs published in the Client ID Document. */
  readonly publishedRedirectUris: readonly string[];

  constructor(requestedRedirectUri: string, publishedRedirectUris: readonly string[], options?: SebaErrorOptions) {
    super(
      "SEBA_ERR_REDIRECT_MISMATCH",
      `Redirect URI "${requestedRedirectUri}" is not published by the Client ID Document. ` +
        `Published redirect_uris: ${formatList(publishedRedirectUris)}. ` +
        `Add the exact string "${requestedRedirectUri}" to the document's redirect_uris array. ` +
        "No dynamic client registration is performed by SEBA.",
      options,
    );
    this.requestedRedirectUri = requestedRedirectUri;
    this.publishedRedirectUris = [...publishedRedirectUris];
  }
}

/**
 * The authorization response, token response or identity token was rejected.
 *
 * Always indicates a security validation failure (state, `iss`, nonce, PKCE,
 * issuer, audience, signature or expiration), never a transient failure.
 */
export class SebaAuthError extends SebaError {
  constructor(message: string, options?: SebaErrorOptions) {
    super("SEBA_ERR_AUTH", message, options);
  }
}

/**
 * The stored session can no longer be used (refresh token revoked, expired or rejected).
 *
 * The local session state has already been cleared when this is thrown.
 */
export class SebaSessionExpiredError extends SebaError {
  constructor(message: string, options?: SebaErrorOptions) {
    super("SEBA_ERR_SESSION_EXPIRED", message, options);
  }
}

/** A DPoP proof could not be created, or the provider rejected the DPoP key binding. */
export class SebaDPoPError extends SebaError {
  constructor(message: string, options?: SebaErrorOptions) {
    super("SEBA_ERR_DPOP", message, options);
  }
}

/** A network request failed (offline, DNS, TLS, connection reset, non-HTTP response). */
export class SebaNetworkError extends SebaError {
  constructor(message: string, options?: SebaErrorOptions) {
    super("SEBA_ERR_NETWORK", message, options);
  }
}

/** Interactive login is impossible in the current environment. */
export class SebaNoUIError extends SebaError {
  constructor(message: string, options?: SebaErrorOptions) {
    super("SEBA_ERR_NO_UI", message, options);
  }
}

/**
 * Type guard for {@link SebaError}.
 *
 * @param value - Any caught value.
 */
export function isSebaError(value: unknown): value is SebaError {
  return value instanceof SebaError;
}

function formatList(values: readonly string[]): string {
  return values.length === 0 ? "(none)" : values.map((value) => `"${value}"`).join(", ");
}
