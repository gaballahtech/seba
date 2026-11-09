<p align="center">
  <img src="./assets/seba-logo-primary.png" alt="SEBA logo" width="420">
</p>

<h3 align="center">Solid-OIDC authentication for JavaScript apps</h3>

<p align="center">Login, session restore, and DPoP-signed <code>fetch</code> — with a small, standards-based API.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@gaballahtech/seba"><img alt="npm version" src="https://img.shields.io/npm/v/%40gaballahtech%2Fseba"></a>
  <a href="https://github.com/gaballahtech/seba/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/gaballahtech/seba/actions/workflows/ci.yml/badge.svg?branch=main"></a>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-green.svg"></a>
  <img alt="Standards: Solid-OIDC, DPoP, PKCE" src="https://img.shields.io/badge/standards-Solid--OIDC%20%7C%20DPoP%20%7C%20PKCE-5b21b6">
</p>

<p align="center">
  <sub>Brand assets: <code>assets/seba-logo-*.png</code>, <code>assets/seba-icon-*.png</code></sub>
</p>

---

`@gaballahtech/seba` (SEBA) is a Solid-OIDC client library for JavaScript. It implements the protocol pieces most apps need — PKCE S256, authorization code flow, ID token validation (JWKS/signature/claims), DPoP-bound access, refresh, and revocation — behind a small API.

**Good fit if:** you’re building a browser app, Node.js tool, or React app that needs to sign in with a Solid Identity Provider and make authenticated requests to protected resources (Pods/servers).

**Important constraints (read before integrating):**
- **Browser security boundary:** tokens/keys live in the browser profile (IndexedDB by default). A successful XSS on your origin can compromise session material — treat XSS prevention/CSP as required (see [Security](#security)).
- **Node.js login is not “magic”:** Node has no browser UI, so you must provide `openAuthorizationUrl` and use a **loopback** `redirectUri`; Node storage defaults to in-memory.
- **Provider differences are real:** Solid-OIDC compliance varies. SEBA is strict by default and supports explicit per-issuer `tolerances` for known non-compliant cases (documented/tested cases in [Provider compatibility](#provider-compatibility)).

## Why SEBA

- **Small API:** `login()`, `restoreSession()`, `fetch()`, `logout()` (+ `session` / `getSession()`).
- **Standards-based security defaults:** PKCE S256, `state` + RFC 9207 `iss` checks, nonce, ID token validation, DPoP proofs (fresh per request), and redirect credential safety.
- **Multiple integration styles:** browser ESM, Node.js (>= 20), zero-build `<seba-login>` Web Component, and React helpers.
- **Transparent behavior:** token-free public session info, explicit errors, and documented interoperability tradeoffs.

## Table of contents

- [Install](#install)
- [Quick start](#quick-start)
  - [Browser (Web Component, no build)](#browser-web-component-no-build)
  - [Browser (JavaScript / TypeScript)](#browser-javascript--typescript)
  - [Node.js](#nodejs)
  - [React](#react)
- [Client ID Document](#client-id-document)
- [Configuration](#configuration)
- [API](#api)
- [Events](#events)
- [Pod data helpers](#pod-data-helpers)
- [Security](#security)
- [Provider compatibility](#provider-compatibility)
- [Project docs](#project-docs)
- [Development](#development)
- [Code graph](#code-graph)
- [License](#license)

## Install

```bash
npm install @gaballahtech/seba
```

- **Node.js:** >= 20 (uses Web Crypto and `fetch`)
- **Browsers:** modern ESM browsers with `crypto.subtle` (secure context / HTTPS or localhost)

## Quick start

### Browser (Web Component, no build)

```html
<seba-login client-id="https://app.example/id.jsonld"></seba-login>

<script type="module">
  import "https://unpkg.com/@gaballahtech/seba/dist/browser/index.js";

  const el = document.querySelector("seba-login");
  el.addEventListener("seba:login", (e) => console.log("WebID:", e.detail.webId));
</script>
```

The element can start login on click, complete the callback on the redirect route, restore a stored session on load, and switch to “Sign out” when authenticated.

**Common attributes:** `client-id` (required), `redirect-uri` (defaults to current page URL without fragment), `issuer` / `issuer-url`, `providers`, `web-id`, `label`, `theme` (`auto|light|dark`), `logo`, `account`, `get-a-pod` (**absolute `https:` only**; falls back to the Solid Project page), `config` (JSON `SebaConfig` overrides, e.g. per-provider `tolerances`).

**Events:** `seba:login`, `login-success` (alias), `seba:logout`, `seba:error`.  
**Utility export:** `safeExternalHttpUrl(value)` validates an absolute `https:` URL and returns it or `null`.

> If your bundler can’t resolve bare imports from a CDN script, import from `./browser` and self-host the dependency (e.g. `jose`) — see `examples/browser/`.

### Browser (JavaScript / TypeScript)

```ts
import { Seba } from "@gaballahtech/seba";

const seba = new Seba({
  clientId: "https://app.example/id.jsonld",
  redirectUri: "https://app.example/callback",
  // debug: true, // non-sensitive diagnostics only
});

const restored = await seba.restoreSession();
if (!restored) {
  // Triggers redirect-based login (or completes callback if the URL has code+state)
  await seba.login({ webId: "https://alice.example/profile/card#me" });
  // Or: await seba.login({ issuer: "https://login.inrupt.com" });
}

const me = await seba.fetch("https://alice.example/private/data");
console.log(seba.session.webId, await me.text());

await seba.logout();
```

### Node.js

Node.js has no browser UI to complete redirects. Provide `openAuthorizationUrl` and a **loopback** `redirectUri` (the library hosts a temporary local callback server).

```ts
import { Seba } from "@gaballahtech/seba";

const seba = new Seba({
  clientId: "https://app.example/id.jsonld",
  redirectUri: "http://127.0.0.1:3000/callback",
  openAuthorizationUrl: (url) => {
    console.log("Open this URL to sign in:", url);
  },
});

const session = await seba.login({ webId: "https://alice.example/profile/card#me" });
const res = await seba.fetch("https://alice.example/private/data");
console.log(session.webId, res.status);
```

> Node.js storage defaults to in-memory (a process restart requires a new login). See `examples/node/`.

### React

`react` is an optional peer dependency.

```tsx
import { SebaLoginButton, useSession } from "@gaballahtech/seba/react";
import type { Seba } from "@gaballahtech/seba";

export function App({ seba }: { seba: Seba }) {
  const session = useSession(seba); // null while signed out
  return (
    <>
      <SebaLoginButton clientId="https://app.example/id.jsonld" />
      <p>{session ? session.webId : "Signed out"}</p>
    </>
  );
}
```

## Client ID Document

Solid-OIDC public clients identify themselves with a **Client ID Document**: an HTTPS URL you control that serves JSON-LD describing the client. Its `redirect_uris` must include the exact `redirectUri` you pass to SEBA.

Template: [`examples/clientid.jsonld`](examples/clientid.jsonld)

Minimal shape:

```json
{
  "@context": ["https://www.w3.org/ns/solid/oidc-context.jsonld"],
  "client_id": "https://app.example/id.jsonld",
  "client_name": "Example app",
  "redirect_uris": ["https://app.example/callback"],
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "scope": "openid webid offline_access",
  "token_endpoint_auth_method": "none"
}
```

## Configuration

`new Seba(config: SebaConfig)`

| Option | Required | Description |
|---|---|---|
| `clientId` | yes | HTTPS URL of your Client ID Document (loopback `http` allowed for development where applicable). |
| `redirectUri` | yes | Callback URL published **verbatim** in `redirect_uris`. In Node.js this must be loopback `http`. |
| `storage` | no | `"indexeddb"` (browser default) or `"memory"` (Node.js default). |
| `debug` | no | `true` emits **non-sensitive** diagnostics via `console.debug` (no tokens/codes/verifiers/keys/proofs/PII). |
| `openAuthorizationUrl` | Node.js | Receives the authorization URL; without it interactive login is impossible in Node. |
| `persistSessionWithoutRefreshToken` | no | `"auto"` (default): if the provider issues **no refresh token**, soft-persist access token + DPoP key so reload works until expiry. `"never"`: keep such sessions **in memory only** (higher privacy, no reload survival). Refresh-token sessions are unchanged. |
| `maxDpopNonceRetries` | no | Retries for `use_dpop_nonce` challenges at token endpoint / resource fetch (default `1`). |
| `tolerances` | no | Per-issuer opt-in relaxations for known non-compliant providers, e.g. `allowNonCompliantAudience`, `allowNonCompliantCnf`. |
| `account` | no | Storage namespace for concurrent sessions in the same browser profile (`seba:<account>`). |

## API

### `login(options?)`

```ts
login(options?: { webId?: string; issuer?: string }): Promise<Session>
```

Starts or completes interactive login. Prefers `issuer`; otherwise resolves the issuer from the WebID profile (`solid:oidcIssuer`); otherwise (browser) the UI flow can prompt/select. If `options.webId` is supplied, the authenticated WebID must match.

### `restoreSession()`

```ts
restoreSession(): Promise<Session | null>
```

Restores a stored session (refreshes as needed). Returns `null` when nothing is stored. Throws `SebaSessionExpiredError` when the grant is no longer valid (local state cleared) and `SebaNetworkError` when the provider is unreachable (local state kept).

### `fetch(input, init?)`

```ts
fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
```

`fetch` with `Authorization: DPoP …` and a fresh DPoP proof. Handles `use_dpop_nonce` challenges and one access-token refresh/retry when appropriate. **Redirects:** same-origin redirects are followed (bounded, new proof per hop); **cross-origin redirects are returned to the caller without forwarding credentials**. A streamed body is never resent.

### `logout()`

```ts
logout(): Promise<void>
```

Clears local session state first, then attempts revocation if the provider advertises `revocation_endpoint`. Revocation failures do not block local logout.

### Session & errors

- `seba.session` / `seba.getSession()`: token-free public session info (`{ webId, isLoggedIn, provider }`).
- All library errors extend `SebaError` with a stable `code` (e.g. `SebaConfigError`, `SebaDiscoveryError`, `SebaAuthError`, `SebaSessionExpiredError`, `SebaNetworkError`, `SebaNoUIError`, etc.).

## Events

`Seba` is an `EventTarget`:

| Event | When | `detail` |
|---|---|---|
| `login` | A session becomes authenticated | `SessionInfo` |
| `session-changed` | Any session transition | `SessionChangeEvent` (`reason`, `session`, `previousSession`) |
| `logout` | The session ends | `SessionInfo \| null` (previous session) |

`session-changed` `reason` values: `"login" | "restore" | "logout" | "expired"`.

## Pod data helpers

Optional convenience helpers (tree-shakeable): import from `@gaballahtech/seba/pod` or named exports from the root. They use `seba.fetch()` under the hood.

```ts
import { fetchSolidDocument, upsertSolidDocument } from "@gaballahtech/seba/pod";

const todos = await fetchSolidDocument(seba, "https://alice.example/private/todos.ttl");
await upsertSolidDocument(seba, "https://alice.example/private/todos.ttl", {
  insert: `@prefix ex: <https://example.org/vocab#>.\n<#task> ex:title "Buy milk".`,
});
```

## Security

Security defaults (summary):
- PKCE S256 only; `state`/`nonce` are high-entropy and single-use.
- RFC 9207 `iss` validation on authorization responses.
- ID token signature verification (JWKS) + claim validation (`iss`, `aud`/`azp`, `exp`, `iat`, `nonce`, `cnf.jkt` requirements per Solid-OIDC/webid context).
- DPoP-bound tokens; fresh proofs per attempt; non-replayable handling for streamed bodies.
- Refresh token + DPoP key persisted; access tokens are not persisted for refresh-token sessions. For no-refresh-token providers, default **soft-persist** (`auto`) can be disabled via `persistSessionWithoutRefreshToken: "never"`.
- `debug` logs **non-sensitive** diagnostics only.

See the full model and limitations in [`SECURITY.md`](./SECURITY.md) and design notes in [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Provider compatibility

This table is intentionally conservative. “Automated (fixture)” means the full `login → fetch → refresh/restore → logout` protocol path and required negative cases run against the local conformance fixture server in CI (`npm run test:e2e`, [E2E workflow](./.github/workflows/e2e.yml)). Live provider claims require real credentials; **solidweb.org is not marked automated** without CI secrets.

| Provider | Solid-OIDC compliance | Observed result (dated) | Test status |
|---|---|---|---|
| Local conformance fixture (loopback) — `tests/e2e/` | Conformant fixture (DPoP, PKCE S256, JWKS, refresh, nonce challenge hooks) | Full cycle + negative cases (expired-token 401→refresh retry, `use_dpop_nonce`, invalid ID-token signature, cross-origin redirect no credential forwarding). | **automated (fixture)** — [E2E workflow](./.github/workflows/e2e.yml) |
| Inrupt (ESS) — `https://login.inrupt.com` | Yes (advertises `webid`, DPoP, refresh tokens) | Discovery validated against SEBA rules (2026-11-05). Interactive full cycle **not** executed (requires real ESS account). | **manual (documented)** — discovery checks via `npm run validate:discovery`; live automation not configured |
| solidweb.org (NSS) — `https://solidweb.org` | Partial (no `webid` scope, no `revocation_endpoint` advertised) | Manual full cycle with a real account reported (2026-11-05): login, DPoP fetch, `restoreSession()`, `logout()` (local clear). Not continuously verified by unattended live CI. | automated (fixture); manual (live, gated by `SEBA_E2E_SOLIDWEB=1`) — [E2E workflow](./.github/workflows/e2e.yml) |
| solidcommunity.net (CSS-based) — `https://solidcommunity.net/` | **Not conformant** (e.g. missing `"solid"` in `aud`, missing `cnf.jkt`; no refresh token observed despite `offline_access`) | Manual partial cycle reported (2026-11-05) with explicit per-issuer `tolerances`. | **manual (documented)** — requires real account + tolerances; not automated live |
| Other (CSS/Pivot/self-hosted) | Varies | Not executed | **manual (documented)** — not automated |

> Results can change with provider upgrades. To re-run discovery checks: `npm run build && npm run validate:discovery` (optional: `SEBA_TEST_WEBID=...`). Protocol/negative-case automation runs via `npm run test:e2e`.

## Project docs

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) — module boundaries and design
- [`SECURITY.md`](./SECURITY.md) — threat model and guarantees
- [`RELEASING.md`](./RELEASING.md) — SemVer, 1.0 path, publishing checklist
- [`MIGRATION.md`](./MIGRATION.md) — migration notes
- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — contribution guidelines
- [`CHANGELOG.md`](./CHANGELOG.md) — release history

## Development

```bash
npm ci
npm run typecheck
npm test
npm run build
npm run check:exports   # publint
npm run test:coverage   # vitest + v8 coverage
```

CI (GitHub Actions): typecheck, tests, build, `publint` (required), plus informational `attw`/coverage steps. Dependency updates are managed via Dependabot.

## Bundle size

Measured from built `dist/` entry files (packed bytes and gzip). The `browser` entry has an enforced gzip budget in CI (`npm run size`). See `scripts/size.mjs`.

| Entry | File | Packed (B) | Gzipped (B) | Budget gzip (B) |
|---|---|---:|---:|---:|
| browser | `dist/browser/index.js` | 337 | 237 | 261 |
| node | `dist/node/index.js` | 329 | 234 | — |
| react | `dist/react/index.js` | 3483 | 1089 | — |
| pod | `dist/pod.js` | 8963 | 2385 | — |

## Code graph

A **Graphify** snapshot (local, AST-only, no LLM) is kept in `graphify-out/` (ignored) to help navigate call relationships. Regenerate locally:

```bash
graphify extract . --code-only --out graphify-out
graphify cluster-only . --no-viz --graph graphify-out/graphify-out/graph.json
# export SVG/HTML if desired using the same graph + labels (see graphify-out)
```

## License

[MIT](./LICENSE)
