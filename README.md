# SEBA

Solid-OIDC authentication in four calls: `login`, `restoreSession`, `fetch`, `logout`.

SEBA implements the Solid-OIDC authorization-code flow with PKCE, DPoP-bound tokens and a
static Client ID Document. It runs in browsers (IndexedDB session storage, redirect-based
login) and in Node.js (in-memory storage, real loopback callback server). The public API is
the same in both.

- No dynamic client registration. Your published Client ID Document is the `client_id`.
- Access tokens live in memory only; the refresh token and DPoP key are the only secrets
  persisted.
- A brand-new DPoP proof is signed for every single attempt. There is no proof cache and no
  option to add one.
- Every incoming value is validated: `state`, RFC 9207 `iss`, `nonce`, PKCE S256, ID token
  signature, `iss`, `aud`, `azp`, `exp`/`iat`, and `cnf.jkt` binding.

## Requirements

- Node.js 20 or newer, or any browser with Web Crypto (ES256), `fetch` and IndexedDB.
- A publicly dereferenceable **Solid Client ID Document** served over HTTPS.

## Install

```bash
npm install @gaballahtech/seba
```

## Publish a Client ID Document

Host a JSON-LD document and use its URL as `clientId`. The `client_id` member must equal the
document URL, and every callback you use must be listed verbatim.

```json
{
  "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
  "client_id": "https://app.example/client-id.jsonld",
  "redirect_uris": [
    "https://app.example/auth/callback",
    "http://127.0.0.1:3000/auth/callback"
  ],
  "client_name": "My Solid App"
}
```

No `registration_endpoint` is ever called; `client_secret` is not used.

## Browser

```ts
import { Seba } from "@gaballahtech/seba";

const seba = new Seba({
  clientId: "https://app.example/client-id.jsonld",
  redirectUri: "https://app.example/auth/callback",
});
```

Call `login()` on the page that handles the callback, as well as on the page that starts it:

```ts
// Runs on every load of the callback route.
const session = await seba.login({ webId: "https://alice.example/profile/card#me" });
```

- Without an authorization response in the URL, `login()` stores the PKCE verifier in
  `sessionStorage` and navigates to the provider. **That promise never settles**, because
  the document is replaced.
- When the provider redirects back with `?code=…&state=…&iss=…`, the same call validates the
  response, exchanges the code, stores the refresh token and DPoP key in IndexedDB, keeps the
  access token in memory, removes the callback parameters from the address bar, and resolves
  with the session.

On later page loads:

```ts
const session = (await seba.restoreSession()) ?? (await seba.login());
```

`login()` with no arguments opens a small built-in dialog asking for a WebID or an identity
provider URL. Pass `{ webId }` or `{ issuer }` to skip it.

### React

See [`examples/react/App.tsx`](examples/react/App.tsx).

## Node.js

Node has no document, so `login()` starts a temporary HTTP server on the loopback interface
from `redirectUri` and waits for the provider to redirect back. The redirect URI must use
plain `http` on `127.0.0.1`, `::1` or `localhost`, and must be published in the Client ID
Document.

```ts
import { exec } from "node:child_process";
import { Seba } from "@gaballahtech/seba/node";

const seba = new Seba({
  clientId: "https://app.example/client-id.jsonld",
  redirectUri: "http://127.0.0.1:3000/auth/callback",
  openAuthorizationUrl(url) {
    exec(`xdg-open "${url}"`); // or `open` on macOS, `start` on Windows
  },
});

const session = (await seba.restoreSession()) ?? (await seba.login({ issuer: "https://idp.example" }));
const response = await seba.fetch(session.webId);
console.log(await response.text());

await seba.logout();
```

Without `openAuthorizationUrl`, `login()` throws `SebaNoUIError` instead of hanging. Node
storage is in memory, so a process restart requires a new login.

See [`examples/node/index.ts`](examples/node/index.ts).

## API

### `new Seba(config)`

| Option | Required | Description |
|---|---|---|
| `clientId` | yes | HTTPS URL of your Client ID Document (loopback `http` allowed in development). |
| `redirectUri` | yes | Callback URL published verbatim in `redirect_uris`. Node.js: loopback `http` only. |
| `storage` | no | `"indexeddb"` (browser default) or `"memory"` (Node.js default). |
| `debug` | no | `true` emits non-sensitive diagnostics through `console.debug`. |
| `openAuthorizationUrl` | Node.js | Receives the authorization URL; without it interactive login is impossible. |

### `login(options?)`

```ts
login(options?: { webId?: string; issuer?: string }): Promise<Session>
```

Starts or completes an interactive login. Prefers `issuer`; otherwise resolves the issuer
from the WebID profile (`solid:oidcIssuer`); otherwise asks the user in the browser. The
resulting WebID must match `options.webId` when it was supplied.

### `restoreSession()`

```ts
restoreSession(): Promise<Session | null>
```

Loads the stored refresh token and DPoP key, refreshes the access token, and returns the
session. Returns `null` when nothing is stored. Throws `SebaSessionExpiredError` when the
provider rejected the grant (local state is cleared) and `SebaNetworkError` when the
provider is unreachable (local state is kept).

### `fetch(input, init?)`

```ts
fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
```

A `fetch` with `Authorization: DPoP …` and a fresh DPoP proof. Same-origin redirects are
followed (up to five, one new proof per hop); cross-origin redirects are returned to the
caller instead of being followed with credentials. One retry is allowed for a
`use_dpop_nonce` challenge and one for an expired/rejected access token; a streamed body is
never resent. The access token is refreshed automatically when it is close to expiry.

### `logout()`

```ts
logout(): Promise<void>
```

Clears memory and storage first, then revokes the refresh token if the provider advertises a
revocation endpoint. Revocation failures never block logout.

### `Session`

```ts
interface Session {
  webId: string;
  isLoggedIn: true;
  provider: string;
}
```

No tokens, no keys, no expiry bookkeeping.

## Errors

All errors extend `SebaError` and carry a stable `code`:

| Class | Meaning |
|---|---|
| `SebaConfigError` | Invalid configuration or unsupported environment. |
| `SebaDiscoveryError` | Issuer, discovery document, WebID profile or Client ID Document could not be validated. |
| `SebaRedirectMismatchError` | The redirect URI is not published by the Client ID Document. |
| `SebaAuthError` | Authorization response, token response or ID token failed validation. |
| `SebaDPoPError` | DPoP key or proof could not be created/verified. |
| `SebaSessionExpiredError` | The stored grant is no longer valid (state cleared). |
| `SebaNetworkError` | Transport failure or 5xx response (state kept). |
| `SebaNoUIError` | Interactive login is impossible in the current runtime (Node.js without a hook). |

## Security defaults

- PKCE S256 only; `state` and `nonce` are 256-bit random values, single-use.
- RFC 9207 `iss` in the authorization response must equal the issuer the login was started
  for.
- ID token signatures are verified against the discovered JWKS; `aud` must contain the
  client ID and `"solid"` when the provider advertises `webid`; `cnf.jkt` must match the
  session key (and is required for `webid`).
- The refresh token and DPoP key are the only persisted secrets; access tokens are held in
  a private field.
- Non-extractable `CryptoKey` storage is used when the engine supports structured cloning;
  otherwise an exported JWK fallback is used (documented in `SECURITY.md`).
- Refresh-token rotation is atomic, and concurrent refreshes are collapsed into one.

See [`SECURITY.md`](SECURITY.md) for the full threat model and limitations, and
[`ARCHITECTURE.md`](ARCHITECTURE.md) for module boundaries.

## Provider compatibility

This table is deliberately conservative: "Publicly tested" means the full login → fetch →
restore → logout cycle was executed against that provider. If it was not, it says so.

| Provider | Protocol support (spec level) | Locally tested | Publicly tested |
|---|---|---|---|
| Hand-written fake provider (`tests/integration`) | Solid-OIDC-shaped: array `aud` with `"solid"`, `azp`, `cnf.jkt` | Full cycle in CI (`npm test`) | — |
| Community Solid Server 7.3.0 | **Not conformant** with Solid-OIDC §8.1: ID token has a string `aud` without `"solid"`, no `cnf` | Discovery, Client ID Document, PKCE/state/nonce, consent, callback, DPoP token exchange all pass; login rejected at ID token validation | No |
| solidcommunity.net | Discovery and issuer handling verified; issuer is `https://solidcommunity.net/` | Discovery only | **No** — no account was available |
| solidweb.org | Discovery verified; issuer is `https://solidweb.org` (no trailing slash); no revocation endpoint advertised | Discovery only | **No** — no account was available |
| solidweb.me | Discovery verified; issuer is `https://solidweb.me/` | Discovery only | **No** — no account was available |

> **⚠️ Community Solid Server 7.3.0**: CSS issues `id_token.aud` as a string instead of `["solid", client_id]` and omits `cnf.jkt`, violating Solid-OIDC §8.1. Seba correctly rejects this token. Track the upstream issue at https://github.com/CommunitySolidServer/CommunitySolidServer/issues/2295. Do not weaken Seba's validation to work around this.

No public provider has completed the full cycle in this release. See
[`VALIDATION_REPORT.md`](VALIDATION_REPORT.md) for transcripts and blockers, and
[`CHANGELOG.md`](CHANGELOG.md) for what changed.

SEBA does not support dynamic client registration. The Client ID Document URL is the
`client_id`, and the provider must be able to dereference it.

## Running the examples

Node (after `npm run build`; requires a provider and a published loopback redirect URI):

```bash
SEBA_CLIENT_ID=http://localhost:8443/client-id.jsonld \
SEBA_REDIRECT_URI=http://localhost:3001/auth/callback \
SEBA_ISSUER=http://localhost:3000 \
WEBID=http://localhost:3000/alice/profile/card#me \
  node examples/node/index.ts
```

React:

```bash
VITE_SEBA_CLIENT_ID=https://app.example/client-id.jsonld npm run example:react:build
npx vite preview --config examples/react/vite.config.ts
```

The React example expects its redirect URI to be `${window.location.origin}/auth/callback`
and published in the Client ID Document.

## Validation tooling

```bash
npm run validate:discovery          # discovery against public providers (no login)
node scripts/validation/css-setup.mjs   # create a local CSS account + pod
node scripts/validation/css-flow.mjs    # full flow against local CSS (see report)
```

## Development

```bash
npm install
npm run typecheck
npm test
npm run build
```

The test suite includes unit tests, DPoP replay tests, and an integration suite that runs the
full login → fetch → refresh → logout flow against a hand-written OpenID Provider over
loopback HTTP.

## License

MIT
