/**
 * OpenID Provider discovery (OpenID Connect Discovery 1.0 §3–§4).
 *
 * SEBA only trusts a discovery document whose `issuer` is byte-identical to the issuer it
 * asked for, and only uses `https` endpoints (loopback `http` for local development).
 */

import { SebaDPoPError, SebaDiscoveryError } from "./errors.js";
import { httpFetch, isOk, JSON_ACCEPT, parseJson, readText } from "./http.js";
import type { OIDCConfiguration } from "../types.js";

/** Hostnames that are only reachable from the local machine. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(["127.0.0.1", "::1", "localhost"]);

/**
 * Whether a hostname is a loopback interface.
 *
 * @param hostname - Hostname from a parsed URL.
 */
export function isLoopbackHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return LOOPBACK_HOSTS.has(host) || host.endsWith(".localhost");
}

/**
 * Validate an issuer identifier.
 *
 * Rules applied (Solid-OIDC §6.1, OIDC Discovery §3): absolute URL, `https` scheme (plain
 * `http` is accepted for loopback development hosts only), a host, and no query or
 * fragment. The issuer string is returned unchanged because issuer identity is exact.
 *
 * @param issuer - Candidate issuer URL.
 * @param label - Field name used in error messages.
 * @throws {@link SebaDiscoveryError} when the value is not a usable issuer.
 */
export function validateIssuerUrl(issuer: string, label = "issuer"): string {
  let url: URL;
  try {
    url = new URL(issuer);
  } catch {
    throw new SebaDiscoveryError(
      `The ${label} "${issuer}" is not an absolute URL. ` +
        'Use the provider\'s issuer identifier, for example "https://login.example.com".',
    );
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new SebaDiscoveryError(
      `The ${label} "${issuer}" must use https. ` +
        "Plain http is only accepted for loopback development hosts (127.0.0.1, ::1, localhost).",
    );
  }
  if (url.hostname === "") {
    throw new SebaDiscoveryError(`The ${label} "${issuer}" has no host component.`);
  }
  if (url.search !== "" || url.hash !== "") {
    throw new SebaDiscoveryError(
      `The ${label} "${issuer}" must not contain a query string or fragment. ` +
        "An issuer identifier is a stable URL such as \"https://login.example.com\".",
    );
  }
  if (url.username !== "" || url.password !== "") {
    throw new SebaDiscoveryError(`The ${label} "${issuer}" must not contain embedded credentials.`);
  }
  return issuer;
}

/**
 * Candidate well-known configuration URLs for an issuer.
 *
 * RFC 8414 inserts the well-known segment between host and path; several providers only
 * serve the appended form. Both are tried, in that order, and only on 404.
 *
 * @param issuer - Validated issuer URL.
 */
export function wellKnownCandidates(issuer: string): string[] {
  const url = new URL(issuer);
  const origin = `${url.protocol}//${url.host}`;
  const path = url.pathname.replace(/\/+$/, "");
  if (path === "") {
    return [`${origin}/.well-known/openid-configuration`];
  }
  return [
    `${origin}/.well-known/openid-configuration${path}`,
    `${origin}${path}/.well-known/openid-configuration`,
  ];
}

/**
 * Compare a provider-declared issuer with the requested one.
 *
 * Exact equality is required, with one narrowly scoped exception: a provider whose issuer
 * has an empty path may publish it as `https://host/` while the caller typed
 * `https://host` (no path). Both denote the same identifier and real providers
 * (solidcommunity.net, solidweb.me, Community Solid Server) publish the trailing-slash
 * form. Nothing else is normalized: paths, ports, schemes and query strings must match.
 *
 * @param declared - Issuer string from the discovery document.
 * @param requested - Issuer string the caller asked for.
 */
export function issuerEquivalent(declared: string, requested: string): boolean {
  if (declared === requested) {
    return true;
  }
  try {
    const left = new URL(declared);
    const right = new URL(requested);
    const emptyPath = (url: URL): boolean => url.pathname === "" || url.pathname === "/";
    return (
      left.origin === right.origin &&
      emptyPath(left) &&
      emptyPath(right) &&
      left.search === "" &&
      right.search === "" &&
      left.hash === "" &&
      right.hash === ""
    );
  } catch {
    return false;
  }
}

/**
 * Validate an endpoint URL from provider metadata.
 *
 * @param value - Candidate value from the discovery document.
 * @param field - Metadata member name, used in error messages.
 * @param issuer - Issuer the document was fetched for, used in error messages.
 */
export function validateEndpointUrl(value: unknown, field: string, issuer: string): string {
  if (typeof value !== "string" || value === "") {
    throw new SebaDiscoveryError(`The discovery document for "${issuer}" is missing the required "${field}" URL.`);
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new SebaDiscoveryError(
      `The discovery document for "${issuer}" declares "${field}" as "${value}", which is not an absolute URL.`,
    );
  }
  if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopbackHost(url.hostname))) {
    throw new SebaDiscoveryError(
      `The discovery document for "${issuer}" declares "${field}" as "${value}", which does not use https. ` +
        "Refusing to send authorization codes or tokens over an insecure endpoint.",
    );
  }
  if (url.hash !== "") {
    throw new SebaDiscoveryError(`The discovery document for "${issuer}" declares "${field}" with a fragment.`);
  }
  return value;
}

function readStringArray(value: unknown, field: string, issuer: string): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new SebaDiscoveryError(`The discovery document for "${issuer}" declares "${field}" as a non-string array.`);
  }
  return [...value];
}

/**
 * Parse and validate an OpenID Provider configuration document.
 *
 * @param raw - Parsed JSON document.
 * @param requestedIssuer - Issuer that was requested; must match the document exactly.
 */
export function parseProviderConfiguration(raw: unknown, requestedIssuer: string): OIDCConfiguration {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SebaDiscoveryError(`The discovery document for "${requestedIssuer}" is not a JSON object.`);
  }
  const document = raw as Record<string, unknown>;

  const declaredIssuer = document["issuer"];
  if (typeof declaredIssuer !== "string" || !issuerEquivalent(declaredIssuer, requestedIssuer)) {
    const found = typeof declaredIssuer === "string" ? `"${declaredIssuer}"` : "missing";
    throw new SebaDiscoveryError(
      `The discovery document for "${requestedIssuer}" declares its issuer as ${found}. ` +
        "A mismatching issuer identifier means the document cannot be trusted; check that the configured issuer is correct.",
    );
  }

  const responseTypes = readStringArray(document["response_types_supported"], "response_types_supported", requestedIssuer);
  if (responseTypes !== undefined && !responseTypes.includes("code")) {
    throw new SebaDiscoveryError(
      `The provider "${requestedIssuer}" does not advertise support for the "code" response type. ` +
        "SEBA only implements the authorization code flow.",
    );
  }

  const dpopAlgorithms = readStringArray(
    document["dpop_signing_alg_values_supported"],
    "dpop_signing_alg_values_supported",
    requestedIssuer,
  );
  if (dpopAlgorithms !== undefined && !dpopAlgorithms.includes("ES256")) {
    throw new SebaDPoPError(
      `The provider "${requestedIssuer}" does not advertise ES256 in "dpop_signing_alg_values_supported". ` +
        `Advertised algorithms: ${dpopAlgorithms.join(", ") || "(none)"}. SEBA requires ES256.`,
    );
  }

  const configuration: OIDCConfiguration = {
    // The provider's spelling is authoritative: real providers commonly publish
    // "https://host/" while users type "https://host". The callback `iss` and later
    // comparisons use this exact string.
    issuer: declaredIssuer,
    authorizationEndpoint: validateEndpointUrl(document["authorization_endpoint"], "authorization_endpoint", requestedIssuer),
    tokenEndpoint: validateEndpointUrl(document["token_endpoint"], "token_endpoint", requestedIssuer),
    jwksUri: validateEndpointUrl(document["jwks_uri"], "jwks_uri", requestedIssuer),
  };

  if (document["revocation_endpoint"] !== undefined) {
    configuration.revocationEndpoint = validateEndpointUrl(
      document["revocation_endpoint"],
      "revocation_endpoint",
      requestedIssuer,
    );
  }
  const scopes = readStringArray(document["scopes_supported"], "scopes_supported", requestedIssuer);
  if (scopes !== undefined) {
    configuration.scopesSupported = scopes;
  }
  const grants = readStringArray(document["grant_types_supported"], "grant_types_supported", requestedIssuer);
  if (grants !== undefined) {
    configuration.grantTypesSupported = grants;
  }
  if (dpopAlgorithms !== undefined) {
    configuration.dpopSigningAlgValuesSupported = dpopAlgorithms;
  }

  return configuration;
}

/**
 * Fetch and validate the OpenID Provider configuration for an issuer.
 *
 * @param issuer - Issuer identifier supplied by configuration, WebID discovery or the user.
 * @param fetchImpl - Runtime `fetch` implementation.
 * @throws {@link SebaDiscoveryError} for an unusable issuer or an invalid/missing document.
 * @throws {@link SebaNetworkError} when the provider cannot be reached.
 */
export async function discoverProvider(issuer: string, fetchImpl: typeof fetch): Promise<OIDCConfiguration> {
  const validated = validateIssuerUrl(issuer);
  const candidates = wellKnownCandidates(validated);
  let response: Response | null = null;
  let lastUrl = candidates[0] ?? validated;

  for (const candidate of candidates) {
    lastUrl = candidate;
    const attempt = await httpFetch(candidate, { headers: { accept: JSON_ACCEPT }, redirect: "follow" }, { fetchImpl });
    if (attempt.status === 404) {
      continue;
    }
    response = attempt;
    break;
  }

  if (response === null) {
    throw new SebaDiscoveryError(
      `No OpenID Provider configuration was found for issuer "${validated}". ` +
        `Tried ${candidates.map((candidate) => `"${candidate}"`).join(" and ")} and received HTTP 404. ` +
        "Check the issuer URL and that the provider publishes openid-configuration.",
    );
  }
  if (!isOk(response)) {
    throw new SebaDiscoveryError(
      `Fetching the OpenID Provider configuration for "${validated}" failed with HTTP ${String(response.status)}. ` +
        `Requested ${lastUrl}.`,
    );
  }

  const text = await readText(response, "OpenID Provider configuration");
  const raw = parseJson<unknown>(text, `The OpenID Provider configuration for "${validated}"`);
  return parseProviderConfiguration(raw, validated);
}

/**
 * Whether a provider advertises Solid `webid` scope support.
 *
 * Used to decide whether Solid-specific ID token requirements (`aud` containing `solid`,
 * `cnf.jkt` binding) are enforced. A provider that does not publish `scopes_supported` is
 * treated as not advertising `webid`, so standard OIDC validation applies.
 *
 * @param configuration - Validated provider configuration.
 */
export function advertisesWebIdScope(configuration: OIDCConfiguration): boolean {
  return configuration.scopesSupported?.includes("webid") === true;
}
