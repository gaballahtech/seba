# SECURITY

## 1. Threat model

| Threat | Assets at risk | Mitigation |
|---|---|---|
| Authorization code interception / mix-up | Access + refresh tokens | PKCE S256, random `state`, RFC 9207 `iss` checked against the issuer the request was built for. |
| ID token forgery or substitution | User identity (`WebID`) | Signature verified with the provider's JWKS; `iss`, `aud`, `azp`, `exp`, `iat`, `nonce` validated; algorithm taken from the key metadata, not the token's preference. |
| DPoP proof replay | Pod access | A new proof (new `jti`, new signature) for every attempt; no proof cache, no TTL, no reuse option. |
| Token theft from the browser profile | Refresh token, DPoP key, soft-persisted access token | The refresh token and key are persisted (IndexedDB). When a provider issues no refresh token, the access token is persisted too by default (`persistSessionWithoutRefreshToken: "auto"`) so a reload can resume the session until it expires; set `"never"` to keep such sessions in memory only. Refresh-token sessions never store an access token. No `localStorage`; no cookies set by the library. |
| XSS on the application origin | Everything the origin can reach | Out of scope to *prevent*; the library minimises the window (no tokens in DOM, no globals, no logging) and documents the residual risk. |
| Credential leak via redirects | Access token, DPoP proof | `redirect: "manual"`; cross-origin redirect responses are returned to the caller, never re-issued with credentials. |
| Duplicate side effects from retries | Application state | Automatic replay is limited to replayable requests (`GET`/`HEAD`/`OPTIONS`, or a re-readable body), at most one nonce retry and one refresh retry. |
| Malicious/compromised provider metadata | Redirection of tokens | Issuer must match the discovery document exactly; endpoints must be `https` (loopback `http` only); redirect URI must be published verbatim by the Client ID Document. |
| Secret leakage through logs | Tokens, codes, keys | Debug logging is structured and excludes credentials by construction; errors carry codes and messages, never payloads. |
| Stolen database copy | Refresh token, key | IndexedDB is origin-bound and not encrypted at rest by SEBA; at-rest protection is the OS/browser profile's job (documented limitation). |

Trust boundaries: (1) the browser page and its origin, (2) the provider's HTTPS endpoints,
(3) the Solid resource server, (4) the published Client ID Document. Everything crossing
those boundaries is validated; nothing is trusted because it "looks like" a token.

## 2. Token storage policy

| Value | Where | Lifetime |
|---|---|---|
| Access token | A private field in `SebaClient` (memory) | Until refresh, logout, or process end |
| Refresh token | IndexedDB (`seba`/`session`, record key `current`) or memory | Until logout / rejection |
| DPoP private key | IndexedDB, structured-cloned `CryptoKey` (non-extractable) or exported JWK fallback | Same as the refresh token |
| DPoP public JWK + thumbprint | With the session record | Non-secret |
| `state`, `nonce`, `code_verifier` | `sessionStorage` (browser) / memory (Node), single transaction record | Deleted after the callback, stale after 10 minutes |
| ID token | Memory, inside the validated token set | Session lifetime in memory |
| Authorization code | Memory, only between callback parsing and exchange | Seconds |

`PersistedSession` has **no access-token field** — the type makes accidental persistence a
compile error. `localStorage`, cookies, `window.name` and URL fragments are never used for
secrets. If IndexedDB is unavailable and `storage` was left at its default, SEBA throws
`SebaConfigError`; it never silently downgrades to a weaker store.

## 3. DPoP implementation requirements (RFC 9449)

- `typ` is `dpop+jwt`, `alg` is `ES256`; the `jwk` header contains only `kty`, `crv`, `x`,
  `y` — never `d`.
- `jti`: 32 bytes from `crypto.getRandomValues`, base64url encoded. Unique per proof.
- `htm`: uppercase HTTP method actually sent.
- `htu`: the request URL with query and fragment removed, normalized by `URL`
  (lowercased scheme/host, default port removed).
- `iat`: seconds since the epoch, from the local clock at signing time.
- `ath`: `base64url(SHA-256(ASCII(access_token)))`, **only** on protected-resource requests.
  Token-endpoint requests carry no `ath` (there is no access token being presented).
- `nonce`: included only when the server supplied a `DPoP-Nonce`; the nonce is cached per
  endpoint, the proof is always regenerated.
- One proof per HTTP attempt. Retries — nonce challenge, token refresh, redirect hop —
  each call `createDPoPProof()` again.

`createDPoPProof()` is a pure function of `(key, method, url, accessToken?, nonce?)`
returning a compact JWS. There is no module-level proof state, so no code path can return
a previously signed proof. `tests/security/dpop-security.test.ts` asserts this directly:
100 sequential proofs for an identical `(htm, htu)` yield 100 distinct JWTs and 100
distinct `jti` values, and a recorded proof never reappears.

## 4. Key management

- Keys are generated with `jose.generateKeyPair("ES256", { extractable: false })` and
  never leave the runtime.
- `structuredClone(privateKey)` is probed once at login. When it succeeds, the
  non-extractable `CryptoKey` is stored and the key material is never exportable
  (`exportKey` throws for the private key). The public JWK is stored alongside it because a
  non-extractable private key cannot reproduce its public half later.
- When the engine cannot clone `CryptoKey`s, SEBA generates an extractable key, exports the
  private JWK and stores it. This is a documented downgrade: the key is readable by
  same-origin script either way, but it is no longer protected from export. The probe
  result is not configurable, and index-key persistence is never used as a silent
  substitute.
- Only one key pair exists per stored session. A new login replaces the record atomically;
  logout deletes it. Keys are never logged, never returned from the public API and never
  included in error messages.
- The public JWK's SHA-256 thumbprint (`jkt`) is what the ID token's `cnf.jkt` is compared
  against; the access token is therefore bound to the same key used for its proofs.

## 5. PKCE and OAuth state

- `code_verifier`: 43 characters from the RFC 7636 alphabet, each from `crypto.getRandomValues`
  (~258 bits of entropy), never shorter than the RFC minimum.
- `code_challenge`: `base64url(SHA-256(ASCII(verifier)))`, `code_challenge_method=S256`.
  `plain` is never sent or accepted.
- `state` and `nonce`: 32 random bytes each, base64url, independent values.
- All three are stored **before** the navigation and consumed exactly once. A callback
  without a pending transaction, with a different `state`, or older than 10 minutes is
  rejected with `SebaAuthError` before the code is exchanged.
- The authorization response's `iss` (RFC 9207) must equal the issuer the pending
  transaction was created for; otherwise `SebaAuthError` (mix-up protection).
- The code is exchanged exactly once. Pending state is removed as soon as the exchange has
  succeeded, so a replayed callback finds no transaction and fails closed. A response that
  fails validation *before* the exchange leaves the transaction in place (until the
  10-minute expiry) so the user can retry; the code itself is never exchanged twice.

## 6. ID token validation

Performed by `validateIdToken()` before any identity value is read:

1. Compact JWS parsed; signature verified with `createRemoteJWKSet(jwksUri)` via `jose`,
   restricted to asymmetric algorithms (`ES256/384/512`, `RS256/384/512`, `PS256/384/512`).
2. `iss` must equal the discovered issuer (exact string).
3. `aud` must contain `client_id`; `azp`, when present, must equal `client_id`; `azp` is
   required when `aud` has multiple values.
4. When the provider advertises the `webid` scope, `aud` must also contain `"solid"`.
5. `exp` must be in the future (60 s clock tolerance), `iat` must not be in the future
   (60 s tolerance), `nbf` is honoured when present.
6. `nonce` must equal the pending transaction's nonce (login only).
7. `sub` is required. `webid`, when present, must be an `https` URL (loopback `http`
   allowed for development); otherwise `sub` is used when it is an `https` URL.
8. `cnf.jkt`, when present, must equal the local DPoP key thumbprint, and is **required**
   when the provider advertises `webid`.
9. The resulting WebID must equal `options.webId` when the caller supplied one
   (`SebaAuthError` on mismatch).

Decoding without verification is never used to make a decision. Failed validation is a
hard `SebaAuthError`; there is no "accept anyway" path.

## 7. Refresh-token handling

- Refresh requests use `grant_type=refresh_token`, `client_id`, the stored refresh token and
  a freshly signed DPoP proof for the token endpoint (no `ath`).
- The response must be `token_type: "DPoP"`; anything else is discarded (`SebaAuthError`)
  and the previous record is left untouched.
- Rotation: a returned `refresh_token` replaces the stored one in a single IndexedDB
  `put`. If the provider omits it, the existing token is kept (RFC 6749 §6 allows both).
- `invalid_grant` / `invalid_token` / `invalid_request` / `unauthorized_client` → storage
  cleared, then `SebaSessionExpiredError`. The application learns the user must sign in
  again. Other OAuth errors surface as `SebaAuthError` and the record is kept.
- Network failures and 5xx responses → `SebaNetworkError`, record **kept**, so a provider
  outage is never reported as a logout.
- An ID token returned by a refresh is validated (signature, `iss`, `aud`, lifetime) and
  its WebID must match the stored one; a nonce is not expected on refresh.
- Concurrent refreshes are collapsed into one in-flight promise to avoid rotation races.

## 8. Replay protection

- DPoP: see §3 — no cache, no TTL, fresh `jti` per attempt.
- OAuth: `state` is single-use and removed before the token request; `nonce` is single-use
  per transaction; PKCE ties the code to this client instance.
- Retries in `Seba.fetch`: at most one `use_dpop_nonce` retry and at most one
  refresh-then-retry, never nested unbounded. Each retry signs a new proof.
- Redirects: at most 5 same-origin hops. `303` switches to `GET`; `301`/`302` on a `POST`
  switch to `GET`; `307`/`308` keep the method and body; other method/status combinations
  are only followed when the body is replayable. Cross-origin targets are never followed
  with credentials; the redirect response is returned instead.
- Requests with a non-replayable body (`ReadableStream`) are never retried after a 401:
  the challenge response is returned unchanged.

## 9. Redirect and request security

- The configured `redirectUri` must appear **verbatim** in the Client ID Document's
  `redirect_uris`; no scheme/host/port/trailing-slash normalization is applied to either
  side, so `https://app.example/cb` never matches `https://app.example/cb/`.
- Node.js callback servers bind only to loopback (`127.0.0.1`, `::1`, `localhost`) and only
  answer the registered path with the expected `state`; anything else gets `404`/`400`. The
  listener is fully closed before `login()` settles, and after a five-minute timeout.
- The authorization URL is built from the discovered endpoints only, over `https`.
- `Authorization`/`DPoP` headers are attached only to requests the caller initiated (plus
  same-origin redirect hops). They are never attached to a different origin, and token
  endpoint requests never carry `Authorization`.
- The provider selection UI validates user input as an `https` URL before use and never
  collects credentials; there is no password field anywhere in the library.

## 10. Logging restrictions

`debug: true` logs only: operation names, issuer/client identifiers, endpoint URLs
(without query strings), status codes, retry reasons and error codes. It never logs access
tokens, refresh tokens, ID tokens, authorization codes, PKCE verifiers/challenges, `state`,
`nonce`, public or private JWKs, or DPoP proofs. Errors contain codes and human-readable
messages; `cause` objects are the original network/JOSE errors and contain no credentials.

## 11. Known limitations

1. **XSS defeats browser storage.** Same-origin script can use the stored refresh token and
   key while the page is open. SEBA reduces exposure but cannot prevent this.
2. **IndexedDB is not encrypted at rest** by SEBA. Anyone with the browser profile can read
   the refresh token and (fallback mode) the exported key.
3. **Opaque browser redirects.** With `redirect: "manual"`, browsers hide `Location` and the
   status of a redirect, so SEBA returns the redirect response instead of following it.
4. **No token introspection.** SEBA validates ID tokens and relies on the resource server
   for access-token validity; revocation is best-effort.
5. **Clock skew tolerance (60 s)** is fixed; a badly skewed device can fail login and
   receives an actionable `SebaAuthError`.
6. **No live-provider verification.** Only the hand-written mock provider and unit-level
   protocol tests were executed in this environment.
7. **`cnf.jkt` requirement gated on advertised `webid` scope.** A provider that omits the
   scope but issues unbound tokens will pass ID token validation; the resource server still
   rejects unbound tokens.
8. **IndexedDB at-rest exposure.** Anyone with the browser profile can read the refresh
   token and — on engines that cannot structured-clone `CryptoKey` — the exported private
   JWK. Mitigation available **today**: pass `storage: "memory"` to keep the refresh token
   and key out of IndexedDB for the lifetime of the page; the session then does not survive
   a reload. No `sessionStorage` session backend is implemented, so it is not offered as a
   mitigation here.

## 12. External Validation Findings (v0.2.0)

Audit of `src/core/dpop.ts`, `src/core/session.ts` and `src/core/client.ts`, plus the real
provider run documented in `VALIDATION_REPORT.md`.

| ID | Severity | Finding | Resolution |
|---|---|---|---|
| F1 | Medium (interop) | Real providers (solidcommunity.net, solidweb.me, CSS 7.3.0) publish a path-less issuer with a trailing slash. Exact string comparison rejected the discovery document when the caller typed the host without `/`. | **Fixed.** `issuerEquivalent()` accepts only the empty-path canonical variant and keeps the provider's spelling for every later comparison; paths/ports/schemes must still match exactly. Unit-tested. |
| F2 | Medium | A refresh whose ID token failed validation (e.g. `webid` for a different user) left the unusable grant in storage and threw `SebaAuthError`, so every subsequent restore repeated the failure. | **Fixed, stricter.** `SessionManager` now clears storage and throws `SebaSessionExpiredError` when refresh-time ID token validation fails. Transport/JWKS errors still keep the record. Regression test added. |
| F3 | Low (accepted) | A callback with a mismatched `state` throws `SebaAuthError` but leaves the pending transaction intact until its 10-minute expiry. | **Accepted.** The code is never exchanged, and the legitimate transaction stays usable. Clearing it would allow a page that can navigate the user to cancel an in-flight login. No token or identity is exposed either way. |
| F4 | Informational | CSS 7.3.0 issues an ID token with string `aud` (no `"solid"`) and no `cnf`, contrary to Solid-OIDC §8.1. | **Not worked around.** Relaxing the audience or `cnf` requirement would remove Solid-specific audience restriction and proof-of-possession binding. The provider is non-conformant; SEBA refuses the session. |

Audit checks that passed, with the mechanism:

| Check | Result |
|---|---|
| New proof for every attempt | `SebaClient.fetch()` calls `createProof()` inside the attempt loop; `requestTokenResponse()` signs again on its nonce retry. No proof object is stored. |
| `ath` only with an access token | `createDPoPProof` adds `ath` only when `input.accessToken !== undefined`; token-endpoint and revocation proofs omit it. |
| `jti` uniqueness | 32 bytes from `crypto.getRandomValues` (256 bits), base64url, per proof. |
| `state` validated before exchange | `parseAuthorizationResponse()` runs before any token request; mismatch throws before the exchange. |
| `use_dpop_nonce` retry signs fresh | `requestTokenResponse()` loops and calls `signer.createProof({ nonce })` again; no cached proof. |
| Refresh-token rotation | Returned refresh token overwrites the stored record with one IndexedDB `put`; concurrent refreshes collapse into one in-flight promise. |
| `restoreSession()` fails closed on identity mismatch | Now clears storage and throws `SebaSessionExpiredError` (F2). |
| No secrets in logs | `debug: true` emits non-sensitive diagnostics (operation names, issuer/client identifiers, endpoint URLs) through `core/client.ts`'s `console.debug`. No tokens, authorization codes, verifiers, keys, proofs, or WebID/PII are logged. |

Residual risk unchanged: XSS on the application origin can use the stored refresh token and
key while the page is open; SEBA cannot prevent that.
