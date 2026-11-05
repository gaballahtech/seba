# RESEARCH

Bounded research for SEBA. Ten-source budget; sources below were actually fetched and read
during this project (no blog posts, no secondary summaries).

## Sources inspected

1. **Solid-OIDC specification** (`solid.github.io/solid-oidc`, Solid-OIDC 1.0 draft) —
   §5 client identification, §6 WebID issuer discovery, §7 authorization code flow + PKCE,
   §8 callback/`iss` handling, §9 token validation and DPoP binding, §10 refresh,
   §11 conformance discovery.
2. **RFC 9449 — OAuth 2.0 Demonstrating Proof of Possession (DPoP)** — §4 proof JWT
   construction and validation, §4.2 claims, §4.3 `ath`, §5 token requests, §6 nonce,
   §7 protected resource access, §8 server-side validation rules.
3. **RFC 7636 — Proof Key for Code Exchange** — §4.1 verifier generation, §4.2 S256
   challenge, §4.3/4.4/4.5 exchange rules.
4. **OpenID Connect Discovery 1.0 (errata set 2)** — §3 metadata values, §4 discovery
   request/response/validation, §7.1 TLS requirements.
5. **`jose` 6.2.15 type definitions and exports inspected locally** (`SignJWT`,
   `jwtVerify`, `createRemoteJWKSet`, `generateKeyPair`, `exportJWK`, `importJWK`,
   `calculateJwkThumbprint`, `base64url`, `errors.JOSEError`).
6. **`idb` 8.0.4 type definitions inspected locally** (`openDB`, `IDBPDatabase`, upgrade
   callbacks, `IDBPDatabase` transaction helpers).

OpenID Connect Core 1.0 §3.1.3.7 (ID token validation steps) was not fetched separately;
its steps are reproduced here through the explicit requirements Solid-OIDC §9 places on
the same validations, and each step is implemented and covered by a test in
`tests/unit/oidc.test.ts`.

## Relevant protocol requirements

### Client identification (Solid-OIDC §5)

- `client_id` is the URL of a dereferenceable **Client ID Document**, served over HTTPS.
- The document is JSON-LD and carries the Solid-OIDC context
  `https://www.w3.org/ns/solid/oidc-context.jsonld`.
- The document's `client_id` member must equal the URL it is served from.
- `redirect_uris` must list the exact redirect URI used in the authorization request.
- Dynamic Client Registration is not used, so the client never calls
  `registration_endpoint` (SEBA ignores that metadata entirely).

### WebID discovery (Solid-OIDC §6)

- Given a WebID `https://host/profile/card#me`, the profile document is
  `https://host/profile/card` — the fragment identifies the subject, it is not sent to the
  server.
- The profile must state `<webID> solid:oidcIssuer <issuer>`.
- The issuer must be an `https` URL with a host, and no query or fragment. Loopback `http`
  is accepted for local development only.
- JSON-LD (`application/ld+json`) and Turtle (`text/turtle`) are the interoperable
  profile formats; a `Link` header with
  `rel="http://www.w3.org/ns/solid/terms#oidcIssuer"` is a documented fallback.

### OpenID Provider discovery (OIDC Discovery §3/§4)

- `issuer` in the metadata document must be identical to the requested issuer; a mismatch
  invalidates the whole document.
- `authorization_endpoint`, `token_endpoint` and `jwks_uri` are required and must be
  absolute `https` URLs.
- `revocation_endpoint` and `dpop_signing_alg_values_supported` are optional.
- For issuers with a path component, RFC 8414 places the well-known segment between host
  and path (`https://host/.well-known/openid-configuration/<path>`); OIDC Discovery
  examples also show `https://host/<path>/.well-known/openid-configuration`. SEBA tries
  the RFC 8414 form first and falls back to the appended form on 404 (documented
  compatibility handling).

### Authorization Code Flow + PKCE (RFC 7636, OIDC Core)

- `code_verifier`: 43–128 characters from `[A-Za-z0-9-._~]`.
- `code_challenge` = `BASE64URL(SHA-256(ASCII(code_verifier)))`, `code_challenge_method=S256`.
- `state` must be cryptographically random and validated before the code is used.
- `nonce` must be cryptographically random and must match the ID token's `nonce` claim.
- The token request repeats `redirect_uri`, `client_id`, `code` and `code_verifier`.

### DPoP (RFC 9449)

- Proof header: `typ=dpop+jwt`, `alg=ES256`, `jwk` = **public** key only.
- Payload: `jti` (unique), `htm` (uppercase method), `htu` (target URI without query and
  fragment, syntactically normalized), `iat` (seconds).
- `ath` = `BASE64URL(SHA-256(ASCII(access_token)))`, included only when an access token is
  presented (protected-resource requests), never on token-endpoint requests.
- Proofs are single-use by design: the server tracks `jti`. A new proof is required for
  every attempt, including retries and authorization-server nonce challenges.
- The authorization server binds the issued access/refresh token to the proof key via
  `cnf.jkt` (JWK thumbprint). The client must keep using that key.
- `DPoP-Nonce` challenges (`use_dpop_nonce`) require a fresh proof carrying the new
  `nonce`; a nonce may be cached, a signed proof may not.

### Refresh (Solid-OIDC §10, RFC 9449 §5)

- `grant_type=refresh_token` with a fresh DPoP proof bound to the same key.
- Refresh tokens rotate; the newest refresh token must be persisted atomically.
- A rotated/deleted refresh token that is rejected invalidates the local session.

## Existing implementation findings

No existing implementation was consulted, by design: `@inrupt/solid-client-authn-*` is
excluded by the task, and reading a reference client was not necessary once the normative
text above was available. The only "existing implementation" inspected was the installed
`jose`/`idb` type surface, to confirm the exact function signatures used here
(for example `generateKeyPair` returning `{ privateKey, publicKey }` and defaulting to
non-extractable keys, and `calculateJwkThumbprint` defaulting to SHA-256).

## Security findings that shaped the design

1. **Proof reuse is the primary DPoP failure mode.** Any cache keyed by `(htu, htm)`
   silently disables replay protection. SEBA therefore has no proof cache, no TTL, and no
   configuration knob for one; every attempt signs a brand-new JWT with a new `jti`.
2. **Refresh tokens are bearer-equivalent if the key leaks.** Both the refresh token and
   the private key live in IndexedDB; an XSS on the application origin can use both. This
   is inherent to browser-based public clients and is documented, not "solved".
3. **`redirect: "manual"` makes cross-origin redirects opaque in browsers.** Credentials
   cannot be re-attached safely, so SEBA never follows cross-origin redirects with
   `Authorization`/`DPoP` headers, and returns the redirect response to the caller.
4. **Content negotiation matters.** Solid providers serve WebID profiles as
   `text/turtle`, `application/ld+json` or HTML with a `Link` header; a parser written for
   one concrete example is fragile.
5. **Provider clock skew is real.** A 60-second tolerance is applied to `exp`/`nbf`/`iat`;
   it is not configurable, so it cannot be widened into a replay window.
6. **RFC 9207 `iss` is mandatory in Solid-OIDC** and prevents mix-up attacks; SEBA rejects
   callbacks without it.

## Identified technical limitations

- **Browsers**: `fetch(..., { redirect: "manual" })` yields an opaque response
  (status `0`) for redirects, so redirected requests are surfaced to the caller instead of
  being followed. The library never re-sends credentials to another origin.
- **IndexedDB** is not available in private-mode variants of some older browsers; SEBA
  fails with `SebaConfigError` rather than falling back to `localStorage`.
- **Non-extractable keys**: whether a `CryptoKey` survives IndexedDB structured cloning
  depends on the engine. SEBA probes this at login and, when cloning is impossible, stores
  an exported JWK instead (documented downgrade, never silent).
- **Token introspection / revocation semantics** vary per provider; revocation is
  best-effort and never blocks local logout.
- **Live provider interoperability was not tested**: there is no network access to any
  Solid identity provider from the build environment and no test account. Compatibility
  claims in `README.md` are limited accordingly.

## Unresolved questions (and the conservative decision taken)

1. **Does every provider emit `iss` on the authorization response (RFC 9207)?**
   Solid-OIDC requires it. Decision: require it, fail closed with `SebaAuthError`, and
   document the requirement. A silent fallback would re-open mix-up attacks.
2. **Should `aud` contain `"solid"`?** Solid-OIDC requires the ID token audience to
   include both the client ID and `solid`. Decision: require `"solid"` **only when the
   provider advertises the `webid` scope** in `scopes_supported`; this keeps SEBA strict for
   Solid providers while remaining usable against plain OIDC providers during evaluation.
   `azp` is required whenever `aud` has more than one value, and must equal `client_id`.
3. **Is `cnf.jkt` always present on ID tokens?** Not guaranteed by every deployment.
   Decision: validate `cnf.jkt` whenever present, and require it when the provider
   advertises `webid`. Access-token binding is enforced by the resource server regardless.
4. **Turtle breadth.** A full RDF parser is a large dependency. Decision: a documented
   subset parser (`src/core/identity.ts`) plus JSON-LD and `Link`-header support; exact
   supported syntax is listed in `README.md` and each construct is unit-tested. Unsupported
   constructs raise `SebaDiscoveryError` instead of being mis-parsed.
5. **Issuer with a path.** Decision: try RFC 8414 ordering, then the appended form, and
   never accept a discovery document whose `issuer` differs from the request.

## Explicit decisions

| Decision | Justification |
|---|---|
| Static Client ID Document only; DCR never implemented | Required by the product constraint; removes a whole class of client-registration attacks and provider-specific behaviour. |
| ES256 / P-256 DPoP keys only | Required by Solid-OIDC; avoids algorithm negotiation bugs. |
| No proof cache, no TTL, no `trustedZoneTtl` option | RFC 9449 replay protection is per-proof; any reuse optimisation would defeat it. |
| Access token held in a private field only | The spec forbids persisting access tokens; nothing else in the library exposes them. |
| Refresh token + key + metadata in IndexedDB, keyed by `client_id` | One origin can host several applications; keying by client ID avoids cross-app overwrite. |
| `sessionStorage` for `state`/`nonce`/`code_verifier` | Survives the redirect round-trip, dies with the tab, never persisted to disk like `localStorage`. |
| Node.js uses a real loopback HTTP server on `127.0.0.1`/`localhost` | Only honest way to receive the callback without browser APIs; bound to loopback only, closed in `finally`. |
| `openAuthorizationUrl` required for Node interactive login | The library must not pretend to open a browser; without the hook it throws `SebaNoUIError`. |
| ID token validated with `jose` + remote JWKS, `requiredClaims: exp/iat/iss/aud/sub` | Signature and claim validation before any identity value is trusted. |
| `htu` = `new URL(target)` with search and hash removed | Matches RFC 9449's "URI without query and fragment" plus RFC 3986 syntax normalization. |
| Errors are typed classes with stable codes | Applications branch on `error.code`; no string matching, no raw string throws. |

## Dependency decision

Runtime dependencies are exactly `jose` (JWS/JWK/JWKS primitives) and `idb` (IndexedDB).
No RDF library was added: the required WebID assertion is a single triple, and the subset
parser is ~200 lines, fully tested, with JSON-LD and `Link` fallbacks. No UI framework is
included; the browser provider selector is vanilla DOM in `src/browser/provider-modal.ts`.
