/**
 * OpenID Connect authorization-code flow with PKCE and DPoP.
 *
 * This module owns authorization request construction, callback validation, token
 * requests and ID token validation. It does not persist anything: the caller decides what
 * to keep.
 */

import {
  base64url,
  createLocalJWKSet,
  createRemoteJWKSet,
  customFetch,
  errors as joseErrors,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";
import { SebaAuthError, SebaError, SebaDPoPError, SebaNetworkError } from "./errors.js";
import { isLoopbackHost } from "./discovery.js";
import { httpFetch, isOk, parseJson, readText } from "./http.js";
import type { DPoPSigner, OIDCConfiguration, PendingAuthorization, TokenSet } from "../types.js";

/** Scopes requested for a Solid session. */
export const DEFAULT_SCOPES = ["openid", "webid", "offline_access"] as const;

/** Characters allowed in a PKCE code verifier (RFC 7636 §4.1). */
const PKCE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/** Fixed clock tolerance for `exp`, `nbf` and `iat`, in seconds. Not configurable. */
export const CLOCK_TOLERANCE_SECONDS = 60;

/** Asymmetric JWS algorithms accepted for ID tokens. */
const ID_TOKEN_ALGORITHMS = ["ES256", "ES384", "ES512", "RS256", "RS384", "RS512", "PS256", "PS384", "PS512"];

/** A validated identity derived from an ID token. */
export interface Identity {
  /** WebID proven by the token. */
  readonly webId: string;
  /** Issuer that signed the token (equals the discovered issuer). */
  readonly issuer: string;
  /** `sub` claim. */
  readonly subject: string;
}

/** Result of a validated authorization-code exchange. */
export interface AuthorizationResult {
  /** Validated token set. The access token must stay in memory. */
  readonly tokens: TokenSet;
  /** Identity proven by the ID token. */
  readonly identity: Identity;
}

/** A PKCE verifier/challenge pair. */
export interface PkcePair {
  readonly codeVerifier: string;
  readonly codeChallenge: string;
}

/**
 * Generate a cryptographically random base64url string.
 *
 * @param byteLength - Number of random bytes (32 → 43 characters).
 */
export function randomToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64url.encode(bytes);
}

/**
 * Create a PKCE S256 verifier and challenge.
 *
 * The verifier uses only the RFC 7636 alphabet and is 43 characters long; the challenge
 * is `base64url(SHA-256(ASCII(verifier)))` with `code_challenge_method=S256`.
 */
export async function createPkcePair(): Promise<PkcePair> {
  const verifier = Array.from({ length: 43 }, () => {
    const byte = new Uint8Array(1);
    crypto.getRandomValues(byte);
    // Rejection-free modulo bias is acceptable here: the alphabet is not a power of two,
    // but 43 characters of 64-symbol alphabet still carry ~258 bits of entropy.
    return PKCE_ALPHABET.charAt((byte[0] as number) % PKCE_ALPHABET.length);
  }).join("");
  return { codeVerifier: verifier, codeChallenge: await pkceChallenge(verifier) };
}

/**
 * Compute the S256 PKCE challenge for an existing verifier.
 *
 * @param codeVerifier - The verifier sent in the token request.
 */
export async function pkceChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(codeVerifier));
  return base64url.encode(new Uint8Array(digest));
}

/**
 * Create the pending authorization transaction.
 *
 * @param input - Issuer, client and redirect information plus optional WebID hint.
 */
export async function createPendingAuthorization(input: {
  issuer: string;
  clientId: string;
  redirectUri: string;
  webId?: string;
}): Promise<PendingAuthorization> {
  const [pkce, state, nonce] = await Promise.all([
    createPkcePair(),
    Promise.resolve(randomToken()),
    Promise.resolve(randomToken()),
  ]);
  const pending: PendingAuthorization = {
    state,
    codeVerifier: pkce.codeVerifier,
    nonce,
    issuer: input.issuer,
    clientId: input.clientId,
    redirectUri: input.redirectUri,
    createdAt: Date.now(),
  };
  if (input.webId !== undefined) {
    pending.webId = input.webId;
  }
  return pending;
}

/**
 * Build the authorization URL.
 *
 * @param input - Provider configuration, client identity and transaction values.
 * @throws {@link SebaAuthError} when the transaction does not match the client identity.
 */
export function buildAuthorizationUrl(input: {
  configuration: OIDCConfiguration;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
  scopes?: readonly string[];
}): string {
  if (input.state === "" || input.nonce === "" || input.codeChallenge === "") {
    throw new SebaAuthError("Refusing to build an authorization URL without state, nonce and PKCE challenge.");
  }
  if (input.clientId !== input.configuration.issuer && input.clientId === "") {
    throw new SebaAuthError("Refusing to build an authorization URL without a client identifier.");
  }
  const url = new URL(input.configuration.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", input.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("scope", (input.scopes ?? DEFAULT_SCOPES).join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("nonce", input.nonce);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.href;
}

/**
 * Validate an authorization response URL and return the authorization code.
 *
 * Checks, in order: provider error, `state`, RFC 9207 `iss`, and the presence of `code`.
 * All failures are {@link SebaAuthError}; nothing is exchanged on failure.
 *
 * @param callbackUrl - URL the provider redirected to.
 * @param pending - Transaction created before the navigation.
 */
export function parseAuthorizationResponse(callbackUrl: string, pending: PendingAuthorization): string {
  let url: URL;
  try {
    url = new URL(callbackUrl);
  } catch {
    throw new SebaAuthError(`The authorization response "${callbackUrl}" is not a valid URL.`);
  }
  const params = url.searchParams;

  const providerError = params.get("error");
  if (providerError !== null) {
    const description = params.get("error_description");
    throw new SebaAuthError(
      `The identity provider returned the error "${providerError}"` +
        (description === null ? "." : `: ${description}`),
    );
  }

  const state = params.get("state");
  if (state === null || state !== pending.state) {
    throw new SebaAuthError(
      "The authorization response state does not match the pending login. " +
        "The response was ignored; start the login again from the application.",
    );
  }

  const issuer = params.get("iss");
  if (issuer === null || issuer === "") {
    throw new SebaAuthError(
      "The authorization response does not contain the RFC 9207 \"iss\" parameter. " +
        `Expected "${pending.issuer}". Solid-OIDC requires providers to return it; the response was rejected.`,
    );
  }
  if (issuer !== pending.issuer) {
    throw new SebaAuthError(
      `The authorization response was issued by "${issuer}", but this login was started for "${pending.issuer}". ` +
        "This is a mix-up attempt or a misconfigured provider; the response was rejected.",
    );
  }

  const code = params.get("code");
  if (code === null || code === "") {
    throw new SebaAuthError("The authorization response does not contain an authorization code.");
  }
  return code;
}

/** Successful token request. */
export interface TokenRequestSuccess {
  readonly ok: true;
  readonly body: Record<string, unknown>;
  readonly response: Response;
}

/** Token request rejected with an OAuth error response. */
export interface TokenRequestFailure {
  readonly ok: false;
  readonly error: string;
  readonly description?: string;
  readonly status: number;
}

/** Outcome of a token request; HTTP failures are values, transport failures throw. */
export type TokenRequestOutcome = TokenRequestSuccess | TokenRequestFailure;

/**
 * Perform a token request with a fresh DPoP proof.
 *
 * One `use_dpop_nonce` challenge is retried with the supplied nonce and a **new** proof.
 * OAuth error responses are returned as {@link TokenRequestFailure} so callers can map
 * `invalid_grant` to an expired session; network failures throw {@link SebaNetworkError}.
 *
 * @param input - Token endpoint, form body, signer and runtime fetch.
 */
export async function requestTokenResponse(input: {
  tokenEndpoint: string;
  body: URLSearchParams;
  signer: DPoPSigner;
  fetchImpl: typeof fetch;
  nonce?: string;
}): Promise<TokenRequestOutcome> {
  let nonce = input.nonce;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const headers: Record<string, string> = {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json",
    };
    try {
      headers["DPoP"] = await input.signer.createProof({
        method: "POST",
        url: input.tokenEndpoint,
        ...(nonce === undefined ? {} : { nonce }),
      });
    } catch (error) {
      throw new SebaDPoPError("Unable to create a DPoP proof for the token request.", { cause: error });
    }

    const response = await httpFetch(
      input.tokenEndpoint,
      { method: "POST", headers, body: input.body.toString(), redirect: "manual" },
      { fetchImpl: input.fetchImpl },
    );

    if (isOk(response)) {
      const text = await readText(response, "token");
      const body = parseJson<unknown>(text, "The token response", (message) => new SebaAuthError(message));
      if (typeof body !== "object" || body === null || Array.isArray(body)) {
        throw new SebaAuthError("The token response is not a JSON object.");
      }
      return { ok: true, body: body as Record<string, unknown>, response };
    }

    const challenge = response.headers.get("dpop-nonce");
    const text = await readText(response, "token error");
    const parsed = safeJson(text);
    const error = typeof parsed?.["error"] === "string" ? parsed["error"] : `http_${String(response.status)}`;
    const description = typeof parsed?.["error_description"] === "string" ? parsed["error_description"] : undefined;

    if (error === "use_dpop_nonce" && challenge !== null && attempt === 0) {
      nonce = challenge;
      continue;
    }
    return {
      ok: false,
      error,
      ...(description === undefined ? {} : { description }),
      status: response.status,
    };
  }
  throw new SebaDPoPError("The provider kept requesting a new DPoP nonce; the token request was abandoned.");
}

function safeJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/**
 * Exchange an authorization code for a DPoP-bound token set and validate the ID token.
 *
 * @param input - Discovery result, client identity, PKCE verifier, signer and nonce.
 */
export async function exchangeAuthorizationCode(input: {
  configuration: OIDCConfiguration;
  clientId: string;
  redirectUri: string;
  code: string;
  codeVerifier: string;
  nonce: string;
  signer: DPoPSigner;
  fetchImpl: typeof fetch;
  expectedWebId?: string;
  jwks?: JWTVerifyGetKey;
}): Promise<AuthorizationResult> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: input.redirectUri,
    client_id: input.clientId,
    code_verifier: input.codeVerifier,
  });

  const outcome = await requestTokenResponse({
    tokenEndpoint: input.configuration.tokenEndpoint,
    body,
    signer: input.signer,
    fetchImpl: input.fetchImpl,
  });
  if (!outcome.ok) {
    throw new SebaAuthError(
      `The token endpoint rejected the authorization code with "${outcome.error}"` +
        (outcome.description === undefined ? "." : `: ${outcome.description}`),
    );
  }

  const tokens = parseTokenSet(outcome.body);
  const identity = await validateIdToken({
    idToken: tokens.idToken,
    configuration: input.configuration,
    clientId: input.clientId,
    nonce: input.nonce,
    signer: input.signer,
    fetchImpl: input.fetchImpl,
    requireDpopBinding: input.configuration.scopesSupported?.includes("webid") === true,
    ...(input.expectedWebId === undefined ? {} : { expectedWebId: input.expectedWebId }),
    ...(input.jwks === undefined ? {} : { jwks: input.jwks }),
  });
  return { tokens, identity };
}

/**
 * Validate a token response body.
 *
 * Failures: missing tokens, or a token type other than `DPoP` (RFC 9449 §5 requires the
 * client to reject a token that is not DPoP-bound).
 *
 * @param body - Parsed token response body.
 */
export function parseTokenSet(body: Record<string, unknown>): TokenSet {
  const accessToken = requireString(body["access_token"], "access_token");
  const tokenType = requireString(body["token_type"], "token_type");
  if (tokenType.toLowerCase() !== "dpop") {
    throw new SebaAuthError(
      `The provider returned token_type "${tokenType}", but SEBA requires DPoP-bound tokens. ` +
        "The token was discarded; check that the provider supports DPoP.",
    );
  }
  const idToken = requireString(body["id_token"], "id_token");
  const tokens: TokenSet = { accessToken, tokenType: "DPoP", idToken };
  const refreshToken = body["refresh_token"];
  if (typeof refreshToken === "string" && refreshToken !== "") {
    tokens.refreshToken = refreshToken;
  }
  const expiresIn = body["expires_in"];
  if (typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0) {
    tokens.expiresIn = expiresIn;
  } else if (typeof expiresIn === "string" && /^\d+$/.test(expiresIn)) {
    tokens.expiresIn = Number.parseInt(expiresIn, 10);
  }
  const scope = body["scope"];
  if (typeof scope === "string" && scope !== "") {
    tokens.scope = scope;
  }
  return tokens;
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value === "") {
    throw new SebaAuthError(
      `The token response does not contain a usable "${field}" value. ` +
        "SEBA requires DPoP-bound access tokens together with an ID token.",
    );
  }
  return value;
}

/**
 * Validate an ID token and derive the authenticated identity.
 *
 * Validation: signature against the provider JWKS, `iss`, `aud` (including `solid` when
 * the provider advertises `webid`), `azp`, `exp`/`nbf`/`iat`, `nonce`, `cnf.jkt` binding,
 * `sub`, and the WebID claim (falling back to `sub` for https WebIDs).
 *
 * @param input - Token, provider configuration, client identity and expectations.
 */
export async function validateIdToken(input: {
  idToken: string;
  configuration: OIDCConfiguration;
  clientId: string;
  nonce?: string;
  signer?: DPoPSigner;
  fetchImpl?: typeof fetch;
  requireDpopBinding?: boolean;
  expectedWebId?: string;
  expectedSubject?: string;
  jwks?: JWTVerifyGetKey;
}): Promise<Identity> {
  const jwks = input.jwks ?? createJwks(input.configuration.jwksUri, input.fetchImpl);
  let payload: Record<string, unknown>;
  try {
    const verified = await jwtVerify(input.idToken, jwks, {
      issuer: input.configuration.issuer,
      audience: input.clientId,
      algorithms: ID_TOKEN_ALGORITHMS,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      requiredClaims: ["iss", "aud", "exp", "iat", "sub"],
    });
    payload = verified.payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof joseErrors.JOSEError) {
      throw new SebaAuthError(`The ID token failed validation: ${error.message}.`, { cause: error });
    }
    if (error instanceof SebaError) {
      throw error;
    }
    throw new SebaAuthError("The ID token could not be verified.", { cause: error });
  }

  const audience = payload["aud"];
  const audiences = Array.isArray(audience) ? audience : [audience];
  const azp = payload["azp"];
  if (azp !== undefined && azp !== input.clientId) {
    throw new SebaAuthError(
      `The ID token was issued to authorized party "${String(azp)}", not to this client ("${input.clientId}").`,
    );
  }
  if (audiences.length > 1 && azp === undefined) {
    throw new SebaAuthError("The ID token has multiple audiences but no \"azp\" claim.");
  }
  const solidRequired = input.configuration.scopesSupported?.includes("webid") === true;
  if (solidRequired && !audiences.includes("solid")) {
    throw new SebaAuthError(
      "The ID token audience does not include \"solid\". Solid-OIDC requires it when the provider advertises the webid scope.",
    );
  }

  if (input.nonce !== undefined && payload["nonce"] !== input.nonce) {
    throw new SebaAuthError("The ID token nonce does not match the login that was started.");
  }

  const issuedAt = payload["iat"];
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) {
    throw new SebaAuthError("The ID token has no usable \"iat\" claim.");
  }
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (issuedAt > nowSeconds + CLOCK_TOLERANCE_SECONDS) {
    throw new SebaAuthError("The ID token was issued in the future; check the device clock.");
  }

  await checkDpopBinding(payload, input);

  const subject = payload["sub"];
  if (typeof subject !== "string" || subject === "") {
    throw new SebaAuthError("The ID token has no usable \"sub\" claim.");
  }
  if (input.expectedSubject !== undefined && subject !== input.expectedSubject) {
    throw new SebaAuthError("The ID token subject does not match the stored session.");
  }

  const webId = extractWebId(payload, subject);
  if (input.expectedWebId !== undefined && webId !== input.expectedWebId) {
    throw new SebaAuthError(
      `The provider authenticated "${webId}", but this login requested "${input.expectedWebId}". ` +
        "The session was not created.",
    );
  }

  return { webId, issuer: input.configuration.issuer, subject };
}

async function checkDpopBinding(
  payload: Record<string, unknown>,
  input: { signer?: DPoPSigner; requireDpopBinding?: boolean },
): Promise<void> {
  const confirmation = payload["cnf"];
  const boundThumbprint =
    typeof confirmation === "object" && confirmation !== null
      ? (confirmation as Record<string, unknown>)["jkt"]
      : undefined;

  if (boundThumbprint !== undefined) {
    if (input.signer === undefined) {
      throw new SebaAuthError("The ID token is bound to a DPoP key that is not available locally.");
    }
    const thumbprint = await input.signer.thumbprint();
    if (boundThumbprint !== thumbprint) {
      throw new SebaAuthError(
        "The ID token is bound to a different DPoP key than the one used for this session. " +
          "The token was discarded.",
      );
    }
    return;
  }

  if (input.requireDpopBinding === true) {
    throw new SebaAuthError(
      "The ID token is not bound to a DPoP key (\"cnf.jkt\"), but the provider advertises the webid scope. " +
        "Solid-OIDC requires DPoP-bound tokens.",
    );
  }
}

function extractWebId(payload: Record<string, unknown>, subject: string): string {
  const claim = payload["webid"];
  const candidate = typeof claim === "string" && claim !== "" ? claim : subject;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new SebaAuthError(
      `The ID token identifies the user as "${candidate}", which is not an absolute URL. ` +
        "A WebID must be an https URL; the session was not created.",
    );
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new SebaAuthError(
      `The ID token identifies the user as "${candidate}", which does not use https. ` +
        "Refusing to create a session for an insecure WebID.",
    );
  }
  return candidate;
}

function createJwks(jwksUri: string, fetchImpl: typeof fetch | undefined): JWTVerifyGetKey {
  const options =
    fetchImpl === undefined
      ? { timeoutDuration: 5_000, cooldownDuration: 30_000, cacheMaxAge: 600_000 }
      : { timeoutDuration: 5_000, cooldownDuration: 30_000, cacheMaxAge: 600_000, [customFetch]: fetchImpl };
  return createRemoteJWKSet(new URL(jwksUri), options);
}

/**
 * Build a JWKS resolver from an in-memory key set. Used by tests and by callers that
 * already hold provider keys.
 *
 * @param keys - Public JWKs.
 */
export function localJwks(keys: readonly JsonWebKey[]): JWTVerifyGetKey {
  return createLocalJWKSet({ keys: [...keys] });
}
