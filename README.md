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
  Chrome/Edge and Firefox are the tested browsers; Safari 17 or newer is expected to work
  (older Safari versions fall back to an extractable-JWK DPoP key — see `SECURITY.md`).
- A publicly dereferenceable **Solid Client ID Document** served over HTTPS.

## Install

```bash
npm install @gaballahtech/seba
```

## How a user signs in

This section is for people who do not write code: a product manager, a designer, or the
app owner. It explains the experience from the user's point of view.

### Before anything

The developer does one setup step, once: they run `npx @gaballahtech/seba client-id` on
their own machine to create a small JSON file that identifies the app to Solid providers.
They host that file at a public HTTPS URL. After that, no one touches this file again.

### The sign-in flow

1. The user opens the app and clicks the **Sign in with Solid** button.
2. A small dialog appears, asking them to choose their Solid provider or type their WebID.
3. They are sent to their provider's own sign-in page, where they log in with the
   username and password they already use there.
4. The provider asks them to confirm that the app may access their data. They approve.
5. They are sent back to the app, which now shows them as signed in, with their WebID
   visible.
6. On later visits, they are signed in automatically, with no button click, as long as the
   session is still valid. If it expires, they sign in again the same way.

### What the user sees

```
[Sign in with Solid]            (button on the page)

        ┌──────────────────────────────┐
        │  Choose your Solid provider   │
        │  ├─ solidcommunity.net         │
        │  ├─ inrupt.net                 │
        │  └─ other (enter your WebID)  │
        │  [Cancel]  [Continue]          │
        └──────────────────────────────┘

        ┌──────────────────────────────┐
        │  Sign in at solidcommunity.net│
        │  (this page is on the         │
        │   provider's website)         │
        └──────────────────────────────┘

  You are signed in as
  @alice https://alice.example.com
  [Sign out]

  ┌──────────────────────────────────┐
  │  Something went wrong while      │
  │  signing you in. Please try      │
  │  again.                          │
  └──────────────────────────────────┘
```

The `<seba-login>` element renders all of these states automatically: the sign-in button,
the provider chooser, the signed-in state, and the error banner. The developer does not
build any of this from scratch.

### What the developer must do

- Run `npx @gaballahtech/seba client-id` once, and host the generated file at an HTTPS URL.
- Add `<seba-login client-id="https://your-app.example.com/.well-known/seba-client-id"
  redirect-uri="https://your-app.example.com/callback"></seba-login>` to the page.

That is the whole setup.

## Bundle size

Measured with rolldown against the published package (browser target, minified, gzip of
every emitted chunk):

| Entry point | gzip |
|---|---|
| `import { Seba } from "@gaballahtech/seba"` — `login`, `restoreSession`, `fetch`, `logout` | **~27.5 kB** |
| `import { defineSebaLogin } from "@gaballahtech/seba"` — the `<seba-login>` element | **~30.4 kB** |
| `import { toTurtle } from "@gaballahtech/seba/pod"` — Pod helpers only | **~0.35 kB** |

`jose` (≈8.7 kB gzipped) and `idb` (≈1.2 kB) are declared dependencies, not inlined in
`dist/`: the published files keep bare `import` statements, so the application's bundler
includes them unless it marks them external. SEBA's own code is ≈17.6 kB of the core
figure. A login-only bundle does not include the Turtle parser, and importing the Pod
helpers from the root entry point does not force them on callers who never use them.

There is no "<12 kB" guarantee. Earlier internal notes implied one; that target was never
met and is not part of the published API.

## Publish a Client ID Document

Host a JSON-LD document and use its URL as `clientId`. The `client_id` member must equal the
document URL, and every callback you use must be listed verbatim.

The package ships a zero-dependency generator, so the document does not have to be written by
hand:

```bash
npx @gaballahtech/seba client-id \
  --client-id https://app.example/client-id.jsonld \
  --redirect-uri https://app.example/auth/callback \
  --client-name "My Solid App" \
  --out public/client-id.jsonld
```

It validates the URLs (HTTPS, or loopback HTTP for local development), writes spec-shaped
metadata (`scope`, `grant_types`, `response_types`), and reminds you to serve the file as
`application/ld+json` at the `client_id` URL. Repeat `--redirect-uri` for additional
callbacks; run `npx @gaballahtech/seba client-id --help` for all options. Printing to stdout
(without `--out`) keeps it usable in CI or a build script.

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

### Sign-in button

`<seba-login>` is a dependency-free custom element. Importing the package has no side
effects; register the element once with `defineSebaLogin()`.

```html
<script type="module">
  import { defineSebaLogin } from "@gaballahtech/seba";

  defineSebaLogin();
</script>

<seba-login
  client-id="https://app.example/client-id.jsonld"
  redirect-uri="https://app.example/auth/callback"
  issuer="https://idp.example"
  theme="auto"
  label="Sign in with Solid"
></seba-login>

<script type="module">
  const button = document.querySelector("seba-login");
  button.addEventListener("seba:login", (event) => {
    console.log("signed in as", event.detail.session.webId);
  });
  button.addEventListener("seba:error", (event) => {
    console.error(event.detail.error);
  });
</script>
```

The element starts the login on click, completes the callback when it is loaded on the
redirect route, restores the stored session on a normal page load, and switches to "Sign
out" once a session exists. Attributes: `client-id` is the only required one; `redirect-uri`
defaults to the current page URL (fragment removed). Also available: `issuer` (or the
SolidOS-style alias `issuer-url`), `providers` (space/comma separated issuer URLs rendered as
a picker when there are two or more), `web-id`, `config` (JSON `SebaConfig` overrides such as
per-provider `tolerances`), `label`, `theme` (`auto` | `light` | `dark`), `logo`, and
`account`. The element also emits `login-success` as an alias of `seba:login` for apps
written against `solid-ui`.

React (`react` is an optional peer dependency):

```tsx
import { SebaLoginButton, useSession } from "@gaballahtech/seba/react";
import type { Seba } from "@gaballahtech/seba";

export function App({ seba }: { seba: Seba }) {
  const session = useSession(seba); // null while signed out

  return (
    <>
      <SebaLoginButton
        clientId="https://app.example/client-id.jsonld"
        redirectUri="https://app.example/auth/callback"
        issuer="https://idp.example"
        onLogin={(session) => console.log(session.webId)}
      />
      <p>{session ? session.webId : "Signed out"}</p>
    </>
  );
}
```

The component registers `<seba-login>` on mount. `useSession` follows the session of an
existing `Seba` instance (the one you use for `fetch`), while the button owns its own.
`SebaLoginButton` also accepts `providers` (issuer URLs), `config` (JSON-serialized
`SebaConfig` overrides) and an optional `redirectUri`.

See also [`examples/react/App.tsx`](examples/react/App.tsx).

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

> ⚠️ When the provider advertises no `revocation_endpoint` (e.g. solidweb.org), logout only
> clears the local state — the refresh token remains valid on the server until it expires.
> Revoke it out-of-band or let it lapse.

### `Session`

```ts
interface Session {
  webId: string;
  isLoggedIn: true;
  provider: string;
}
```

No tokens, no keys, no expiry bookkeeping.

### `onSessionChange(listener)` / `onSessionExpired(listener)`

```ts
onSessionChange(listener: (event: SessionChangeEvent) => void): () => void
onSessionExpired(listener: (event: SessionChangeEvent) => void): () => void
offSessionChange(listener: (event: SessionChangeEvent) => void): void
getSession(): Promise<Session | null>
```

Subscribe before calling `login()`/`restoreSession()` so no transition is missed. Both
subscribe methods return an unsubscribe function. Listener exceptions are swallowed and
never interrupt the session flow.

| Surface | Event | `detail` | Emitted when |
|---|---|---|---|
| Facade | `reason: "login"` | `{ reason, session }` | An interactive login finished and the session was stored. |
| Facade | `reason: "restore"` | `{ reason, session }` | `restoreSession()` resumed a stored session. |
| Facade | `reason: "logout"` | `{ reason, session: null }` | `logout()` cleared the local session. |
| Facade | `reason: "expired"` | `{ reason, session: null }` | The session cannot continue; at most once per session. |
| Element | `seba:login` | `{ session }` | Same as the `login` reason. |
| Element | `seba:restore` | `{ session }` | Same as the `restore` reason. |
| Element | `seba:logout` | `{ session: null }` | Same as the `logout` reason. |
| Element | `seba:session-expired` | `{ session: null }` | Same as the `expired` reason. |
| Element | `login-success` | `{ session }` | Compatibility alias of `seba:login` (SolidOS naming). |
| Element | `seba:error` | `{ error }` | A login, logout or configuration error in the component. |

```ts
const unsubscribe = seba.onSessionExpired(() => {
  showSignInDialog();
});
```

### Pod helpers

Zero-dependency helpers for the Turtle subset used by Solid pods: `parseSubjectTriples`,
`objectify` and `toTurtle`. Import them from the `@gaballahtech/seba/pod` subpath so a
login-only bundle never pulls the Turtle parser in:

```ts
import { pod, parseSubjectTriples, toTurtle } from "@gaballahtech/seba/pod";
```

They are also re-exported from the package root, and `pod` groups the three functions. They
handle absolute IRIs, blank nodes, string/number/boolean literals, `@lang` and
`^^<datatype>` suffixes, and ignore `@prefix`/`PREFIX`/`BASE` directives (prefix expansion
is not performed).

## Brand & logo usage

The five 512×512 PNG originals in [`assets/`](assets) are shipped through the `./assets/*`
export for `og:image`, favicons and tooling that does not accept SVG. The sign-in button does
not fetch them: each treatment is also embedded as an equivalent 48×48 inline SVG data URI,
so it paints without a network request and stays crisp at any pixel density.

| Variant | File | Use |
|---|---|---|
| `primary` | `assets/seba-logo-primary.png` | Accent-coloured logo on light backgrounds. |
| `inverse` | `assets/seba-logo-inverse.png` | White logo on dark backgrounds. |
| `monochrome` | `assets/seba-logo-monochrome.png` | Single-colour contexts, print, embossing. |
| `solid` | `assets/seba-icon-solid.png` | Filled app icon. |
| `favicon` | `assets/seba-icon-favicon.png` | Browser favicon and small avatars. |

```html
<link rel="icon" href="/node_modules/@gaballahtech/seba/assets/seba-icon-favicon.png" />
<seba-login ... logo="inverse"></seba-login>
<seba-login ... logo="none"></seba-login>
```

```ts
import { sebaLogo, sebaLogoImage } from "@gaballahtech/seba";

sebaLogo.primary.png;      // "assets/seba-logo-primary.png" (raster original)
sebaLogoImage("favicon");  // "data:image/svg+xml,..."   (inline, no request)
```

Keep clear space of at least half the mark's height around the logo, do not recolour or
distort it, and do not place the accent mark on a low-contrast accent background — use the
`inverse` or `monochrome` treatment instead.

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
- The refresh token and DPoP key are persisted. When a provider issues **no** refresh token,
  the access token is stored too (soft-persist) so a reload can resume the session until it
  expires; refresh-token sessions never store an access token.
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
| solidcommunity.net (CSS-based) | **Not conformant** with Solid-OIDC §8.1: ID token `aud` lacks `"solid"`, no `cnf.jkt` (same issue family as CSS #2295). Also: advertises `offline_access` but the token response carries **no refresh token** (verified 2026-11-06; requested scope was `openid webid offline_access`) | Partial cycle with a real account (2026-11-05): login + consent + DPoP **Pod write/read** verified — the written file `seba-todos.ttl` was independently fetched and matched the app's input verbatim. Uses per-issuer `tolerances` for the two conformance gaps. Reload works inside the access-token lifetime via soft-persisted sessions | **No** — partial cycle only |
| solidweb.org | Discovery verified; issuer is `https://solidweb.org` (no trailing slash); no revocation endpoint advertised | Discovery only | **No** — no account was available |
| solidweb.me | Discovery verified; issuer is `https://solidweb.me/` | Discovery only | **No** — no account was available |

> **⚠️ Community Solid Server 7.3.0**: CSS issues `id_token.aud` as a string instead of `["solid", client_id]` and omits `cnf.jkt`, violating Solid-OIDC §8.1. Seba correctly rejects this token. Track the upstream issue at https://github.com/CommunitySolidServer/CommunitySolidServer/issues/2295. Do not weaken Seba's validation to work around this.
>
> **solidcommunity.net** runs a CSS build from the same conformance family. Login completes only with the two documented opt-ins for that provider (`tolerances: { "https://solidcommunity.net/": { allowNonCompliantAudience: true, allowNonCompliantCnf: true } }`); everything else — signature, `client_id` audience, `iss`, PKCE, DPoP proofs on every request — is fully enforced.

Full-cycle validation against a **real public provider** (solidcommunity.net, 2026-11-05:
login → consent → callback → token exchange → ID-token checks → DPoP fetch → Turtle write/read on
the Pod) is documented in the validating application's TEST_REPORT.md. Remaining unvalidated steps on
public providers: `restoreSession()` across a reload and `logout()` revocation. See
[`VALIDATION_REPORT.md`](VALIDATION_REPORT.md) for the earlier transcripts and blockers, and
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
