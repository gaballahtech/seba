# ARCHITECTURE

## 1. System overview

SEBA is a single npm package with three entry points over one implementation:

```
                 ┌──────────────────────────────┐
   seba          │  src/index.ts  (public API)  │
                 └──────────────┬───────────────┘
                    ┌───────────┴────────────┐
                    │  src/seba.ts  (Seba)   │  4 public methods, lazy runtime binding
                    └───────────┬────────────┘
                                │
                 ┌──────────────▼───────────────┐
                 │  src/core/client.ts          │  protocol orchestration, platform-agnostic
                 └──┬────────┬────────┬─────────┘
        ┌───────────┘        │        └─────────────┐
┌───────▼──────┐  ┌──────────▼───────┐  ┌──────────▼─────────┐
│ identity.ts  │  │ discovery.ts     │  │ oidc.ts            │
│ Client ID    │  │ OP metadata      │  │ PKCE, state, nonce │
│ WebID        │  │ issuer checks    │  │ callback, tokens   │
└──────────────┘  └──────────────────┘  └──────────┬─────────┘
                                                   │
                                   ┌───────────────▼──────────┐
                                   │ dpop.ts   session.ts     │
                                   │ proofs    storage/refresh│
                                   └───────────────┬──────────┘
                                                   │ Platform interface
                        ┌──────────────────────────┴─────────────────────────┐
              ┌─────────▼──────────┐                            ┌────────────▼─────────┐
              │ browser/platform   │                            │ node/platform        │
              │ sessionStorage,    │                            │ memory pending auth, │
              │ IndexedDB, DOM     │                            │ loopback HTTP server │
              └────────────────────┘                            └──────────────────────┘
```

`src/core/client.ts` contains **all** protocol sequencing exactly once. Browser and Node
differences are confined to the `Platform` interface (`src/types.ts`): how a callback URL
is obtained, where pending authorization state lives, and which storage backend is the
default. There is no second code path for "Node login"; the same validation runs for both.

## 2. Core module responsibilities

| Module | Responsibility | Deliberately not responsible for |
|---|---|---|
| `core/errors.ts` | Error hierarchy with stable `code` values. | Deciding retry policy. |
| `core/http.ts` | JSON/text fetching with content-type checks, `SebaNetworkError` mapping, non-2xx handling, timeout. | Auth headers (callers add them). |
| `core/identity.ts` | Client ID Document fetch/validation, exact redirect-URI membership, WebID URL handling, Turtle-subset + JSON-LD + `Link` issuer extraction. | Trusting any value it parsed (issuer is re-validated). |
| `core/discovery.ts` | Issuer validation, well-known lookup, OP metadata validation. | Assuming optional metadata exists. |
| `core/oidc.ts` | PKCE, `state`, `nonce`, authorization URL, callback parsing/validation, code exchange, token-response parsing, ID token validation, WebID extraction. | Storing anything. |
| `core/dpop.ts` | ES256 key generation/import, proof signing, `jti`, `htu`, `ath`, thumbprints, nonce plumbing. | Caching proofs (forbidden). |
| `core/session.ts` | The active session record, refresh with rotation, revocation, logout cleanup, restore. | Deciding whether to redirect the user, storage engines. |
| `core/storage.ts`, `browser/storage.ts` | Memory adapters (Node.js, tests) and IndexedDB/`sessionStorage` adapters (browser). | Protocol decisions. |
| `core/client.ts` | The four operations, fetch retry/redirect policy, in-memory access token, last-seen DPoP nonce, debug logging. | Any DOM or `node:` API. |
| `seba.ts` | Public `Seba` class with the four documented methods; binds a runtime platform lazily on first use. | Protocol details. |

## 3. Browser architecture

`src/browser/platform.ts` supplies:

- `currentUrl()` → `new URL(window.location.href)`.
- `pendingAuth` → one `sessionStorage` record under `seba.pending-authorization`
  (the record itself carries `clientId` and `redirectUri`, which are re-checked on the
  callback). The PKCE verifier and expected nonce never leave the tab and never appear in
  a URL.
- `beginInteractiveLogin()` → `window.location.assign(authorizationUrl)`; the returned
  promise intentionally never settles, because the document is being replaced.
- `selectIdentity()` → the vanilla DOM provider selector in `browser/provider-modal.ts`
  (focus trap, `Esc` to close, `Enter` to submit, WebID or custom issuer input, no password
  field, no network calls).
- `createStorage("indexeddb")` → `idb`-backed adapter; `"memory"` → process memory.
- `clearCallback()` → `history.replaceState` to remove `code`/`state`/`iss` from the
  address bar after the callback has been consumed.

Login lifecycle in a browser (documented in `README.md`):

1. Application calls `login()`. There is no callback in the URL, so SEBA discovers the
   provider, stores pending state in `sessionStorage`, and navigates away.
2. The provider authenticates the user and redirects to `redirectUri?code=…&state=…&iss=…`.
3. The application calls `login()` again on that page. SEBA recognises the callback,
   validates `state`, `iss`, `nonce`, PKCE and the ID token, stores the refresh token and
   key, keeps the access token in memory, returns the `Session`.

Because step 1 unloads the page, its promise never resolves; this is documented rather
than papered over with polling or `BroadcastChannel` tricks.

`src/browser/index.ts` is the `@gaballahtech/seba/browser` entry point: it re-exports the public API and
`createBrowserPlatform`.

## 4. Node.js architecture

`src/node/platform.ts`:

- `currentUrl()` → `null` (no document).
- `pendingAuth` → an in-process record; no browser storage API is referenced anywhere in
  `src/node/`.
- `beginInteractiveLogin()` →
  1. parse the configured `redirectUri`; require `http:` and a loopback host
     (`127.0.0.1`, `::1`, `localhost`) — never bind `0.0.0.0`;
  2. `node:http` server on that host and port, only answering the registered path;
  3. call `openAuthorizationUrl(authorizationUrl)` (required; otherwise
     `SebaNoUIError` — thrown *before* the server is started);
  4. respond with a small HTML page that contains no secrets and close the listener
     completely before resolving the login promise, so the port is free for the next login
     and no late request can reach a closed transaction;
  5. reject after a five-minute timeout and close the listener the same way.
- `createStorage()` → memory only; `"indexeddb"` throws `SebaConfigError` with an
  actionable message instead of pretending a browser store exists.

Provider and resource calls use the runtime's global `fetch` through `core/http.ts`, which
adds an abort-based 10-second timeout and maps transport failures to `SebaNetworkError`.
`src/node/index.ts` is the `@gaballahtech/seba/node` entry point: it re-exports the public API and
`createNodePlatform`.

The configured `redirectUri` must still be published by the Client ID Document, so a
loopback URI must appear in `redirect_uris`; otherwise `SebaRedirectMismatchError` is
thrown before any listener is opened.

## 5. Authentication flow

```
login(options)
  │
  ├─ callback present & pending state found? ──yes──► completeLogin()
  │                                                   ├ state exact match
  │                                                   ├ RFC 9207 `iss` == pending issuer
  │                                                   ├ error param? → SebaAuthError
  │                                                   ├ POST token endpoint (fresh DPoP proof, no ath)
  │                                                   ├ token_type == DPoP
  │                                                   ├ validate ID token (JWKS, iss, aud, azp, exp, iat, nonce)
  │                                                   ├ cnf.jkt == our thumbprint (and required for `webid`)
  │                                                   ├ webId == requested webId (when given)
  │                                                   ├ persist {refresh_token, key, webId, issuer, clientId}
  │                                                   └ keep access token in memory → Session
  │
  └─ no callback
       ├ issuer = options.issuer ?? discoverIssuerForWebId(options.webId) ?? platform.selectIdentity()
       ├ loadClientIdDocument(clientId) → redirect URI must be listed exactly
       ├ discoverProvider(issuer)
       ├ create PKCE verifier/challenge, state, nonce → PendingAuthorization
       ├ build authorization URL (response_type=code, scope=openid webid offline_access,
       │   code_challenge_method=S256, nonce, state, client_id)
       ├ platform.beginInteractiveLogin(...)  → browser: navigate away
       │                                      → node: loopback callback URL
       └ completeLogin(callbackUrl)
```

## 6. Session lifecycle

```
(no session) ──login──► { accessToken (memory), refreshToken (storage), key (storage) }
                              │
                    access token expires / 401 invalid_token
                              ▼
                     refresh (grant_type=refresh_token, fresh proof)
                              │ rotation: persist new refresh token atomically
                              ▼
                        new access token in memory
                              │
                    restoreSession() on reload: load record → refresh → Session
                              │ record missing → null
                              │ invalid_grant → clear storage + SebaSessionExpiredError
                              │ 5xx / offline → SebaNetworkError, record kept
                              ▼
                     logout(): clear memory → revoke (best effort) → delete record
```

The persisted record (`PersistedSession`) is the only durable state:
`version`, `webId`, `provider`, `clientId`, `refreshToken`, `key`
(`CryptoKey` + public JWK, or exported JWK), optional `scope`, `createdAt`, plus
`accessToken`/`accessTokenExpiresAt` **only** for providers that issue no refresh token
(soft-persist by default, controlled by `persistSessionWithoutRefreshToken`; so a reload can resume until the token expires when `"auto"`). Refresh-token sessions
never persist an access token.

Refresh is serialized through a single in-flight promise in `core/session.ts`, so ten
concurrent `fetch()` calls that all see an expired token perform one refresh, not ten
(rotating refresh tokens would otherwise invalidate each other).

## 7. DPoP lifecycle

1. **Generation** at login: ES256/P-256 via `jose.generateKeyPair`. Non-extractable private
   key when the runtime can structured-clone `CryptoKey` (probed with `structuredClone`);
   otherwise an extractable key exported to JWK and stored as such (reported in
   `SECURITY.md`).
2. **Signing** per attempt: `{typ: "dpop+jwt", alg: "ES256", jwk: publicJwk}` with
   `{jti, htm, htu, iat}` plus `ath` only when an access token is presented, plus `nonce`
   when the server supplied one.
3. **No persistence of proofs.** `createDPoPProof()` is pure: inputs in, one JWT out. It is
   called once per HTTP attempt, including retries (`nonce` challenge, token refresh,
   redirect hop).
4. **Nonce handling**: `core/client.ts` keeps the most recent `DPoP-Nonce` returned by a
   protected resource and sends it with subsequent proofs. A nonce is server state, not a
   proof; caching it is explicitly allowed by RFC 9449. Token requests handle their own
   `use_dpop_nonce` challenge in `core/oidc.ts`.
5. **Binding**: the key pair stays with the session record; the ID token's `cnf.jkt` and
   the access token's binding are checked against its thumbprint.

## 8. Storage architecture

| Runtime | Default | Record location | Access token |
|---|---|---|---|
| Browser | `indexeddb` | DB `seba`, object store `session`, single record key `current` | memory only |
| Browser (`storage: "memory"`) | opt-in | module-level map | memory only |
| Node.js | `memory` | process memory | memory only |

`sessionStorage` holds **only** the pending authorization transaction
(`state`, `code_verifier`, `nonce`, `issuer`, `clientId`, `redirectUri`, `createdAt`,
optional `webId`) and is deleted as soon as the callback is processed. `localStorage` is
never used. IndexedDB writes are whole-record `put`s, which makes refresh-token rotation a
single atomic overwrite.

## 9. Public API design

```ts
class Seba {
  constructor(config: SebaConfig)
  login(options?: LoginOptions): Promise<Session>
  restoreSession(): Promise<Session | null>
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
  logout(): Promise<void>
}
```

Exactly four public methods. `Session` carries `webId`, `isLoggedIn: true`, `provider` and
no tokens. Tokens, keys and proofs are never exported from the package root. Configuration
is validated when the first operation runs (`SebaConfigError`); there are no
proof-caching or TTL knobs.

`Seba` binds its platform on first use (dynamic import of `browser/platform.js` when
`window`/`document` exist, otherwise `node/platform.js`), which keeps `node:http` out of
browser bundles and DOM code out of Node.

## 10. Architectural trade-offs

| Trade-off | Choice | Consequence |
|---|---|---|
| Redirect lifecycle vs. promise ergonomics | `login()`'s promise does not settle when navigation happens | Applications must call `login()` again on the callback page; documented with code. |
| No proof cache | Re-sign every attempt | Slight CPU cost per request (one ECDSA signature); replay protection stays intact. |
| `redirect: "manual"` everywhere | Never re-attach credentials on redirects | Browsers surface redirects to the app instead of following them. |
| Custom Turtle subset | ~200 lines instead of an RDF dependency | Documented, tested subset + JSON-LD + `Link` fallback; unsupported syntax fails loudly. |
| Static client identity | No DCR | One published JSON-LD file must list every redirect URI. |
| Loopback-only Node login | Real HTTP callback | Requires `openAuthorizationUrl`; impossible flows fail with `SebaNoUIError`. |
| `cnf.jkt` requirement gated on advertised `webid` scope | Interoperable and strict | Providers that do not advertise `webid` get standard OIDC validation only. |
