# Changelog

## [0.5.3] — 2026-11-07

A Google-quality sign-in surface.

### Added

- The sign-in button opens a polished dialog: a custom provider listbox with brand
  tiles (loved name + domain on every row), an "or" divider, and a manual input for
  WebID or provider URL. WebIDs resolve through `solid:oidcIssuer` discovery.
- "New to Solid? Create a Pod →" link in the dialog, following the selected
  provider's sign-up page (falls back to the `get-a-pod` attribute).
- `lastIssuer()` / `forgetIssuer()`: the previous provider is remembered in
  `localStorage` (`seba:last-issuer`), pinned first in the picker and shown as
  "Continue with …" on the button.
- Dark theme support for the whole dialog, focus trap, Esc/backdrop close,
  Arrow/Home/End/Enter/Escape/typeahead keyboard support and ARIA listbox semantics.
- Purple gradient button (`#7C3AED → #5B21B6`) with a bare white logo treatment
  (`logo="white"` artwork variant) so it reads cleanly on any theme.

### Changed

- The 0.5.2 provider-chips experiment (never published) is reverted; this release
  is the redesigned outcome of the same feedback.
- New exports: `providerInfo`, `PROVIDER_INFO`, `issuerDomain`, `providerChoices`,
  `classifyInput`, `lastIssuer`, `forgetIssuer`, `ProviderInfo`, `ProviderChoice`,
  and the `white` logo variant.

## [0.5.1] — 2026-11-07

Size and API cleanup.

### Changed

- **Breaking:** `Seba.pod` is removed. Import the helpers from `@gaballahtech/seba/pod` (or
  from the root named exports). Keeping them off the facade lets a login-only bundle
  tree-shake the Turtle parser: the core browser bundle drops from 28.7 kB to 27.5 kB
  gzipped.
- **Inline artwork is SVG.** The component embeds 48×48 SVG data URIs instead of base64
  PNGs. The vector geometry was measured from the PNG originals and matched at ≈99% pixel
  IoU. The five 512×512 PNG files are still shipped in `assets/`. The element bundle drops
  from 35.6 kB to 30.4 kB gzipped.
- **`sebaLogoImage()` returns an SVG data URI.** `sebaLogo.*.dataUri` is now
  `data:image/svg+xml,...`; `sebaLogo.*.png` still names the shipped PNG original.

### Docs

- README states measured bundle sizes, explains that `jose` (≈8.7 kB gzipped) and `idb`
  (≈1.2 kB) are dependencies bundled by the application, and drops the stale "<12 kB" idea.

## [0.5.0] — 2026-11-06

Additive release: a drop-in sign-in component, session events, Pod helpers and React
bindings. No behaviour change to login, refresh, storage or validation.

### Added

- **`<seba-login>`** — a zero-dependency custom element with shadow DOM. It starts the login,
  completes the callback on the redirect route, exposes `login()`/`logout()`/`session`, and
  switches between "Sign in" and "Sign out". Attributes: `client-id`, `redirect-uri`,
  `issuer`, `web-id`, `config` (JSON `SebaConfig` overrides), `label`, `theme`
  (`auto`/`light`/`dark`), `logo`, `account`. `redirect-uri` is optional (defaults to the
  current page URL), `issuer-url` is accepted as a SolidOS-style alias, and `providers`
  renders an issuer picker. The element also emits `login-success` alongside `seba:login`.
  Register it with `defineSebaLogin()`; importing the package stays side-effect free.
- **Session events** — `onSessionChange`, `offSessionChange`, `onSessionExpired` and
  `getSession()` on the facade, plus `SessionChangeEvent`/`SessionChangeReason` types.
  Reasons: `login`, `restore`, `logout`, `expired`; `expired` fires at most once per session.
  Listener exceptions are swallowed so application callbacks cannot break session handling.
- **`Seba.pod`** — `parseSubjectTriples`, `objectify` and `toTurtle`, also exported from the
  package root zero-dependency helpers for the Turtle subset used by Solid pods.
- **`seba client-id` CLI** — a zero-dependency generator for the Solid-OIDC Client ID
  Document. It validates HTTPS/loopback URLs, emits `scope`, `grant_types` and
  `response_types`, supports repeated `--redirect-uri`, and can write the file with `--out`
  (or print it to stdout for build scripts).
- **React bindings** — `@gaballahtech/seba/react` exports `SebaLoginButton` and `useSession`.
  `react` is an optional peer dependency; the core entry point never imports it. The button
  accepts `config` and `providers` props, and `redirectUri` is optional.
- **PNG brand assets** — five 512×512 PNGs in `assets/` (primary, inverse, monochrome, solid,
  favicon) served through the `./assets/*` export, plus 48×48 PNG data URIs embedded for the
  component. No SVG is used or shipped. The source PNGs were re-encoded losslessly (pixel
  comparison unchanged) and now total ~24 kB instead of ~64 kB.

### Notes

- This release has **not yet been tested against a provider** in its component/React form.
  The underlying login, refresh and DPoP paths are unchanged from 0.4.0.

## [0.4.0] — 2026-11-05

Completeness release driven by the first public full-cycle validation
(solidcommunity.net login → fetch → Pod write; see the validating app's TEST_REPORT.md).

### Fixed (2026-11-06, same release, second validation round)

- **All resource fetches and token requests now use `cache: "no-cache"`.** Community
  Solid Server emits no `Cache-Control` on resource GETs, so browsers apply heuristic
  freshness — a burst of rapid writes reads a heuristically stale pre-PUT ETag and every
  conditional `PUT` with `If-Match` fails with `412` (reproduced and diagnosed live via
  instrumented saves: fresh GET → correct `If-Match` → `412`, deterministically, while
  the server never saw a race). `seba.fetch` no longer trusts local caches.
- **Sessions are persisted even when the provider issues no refresh token** (soft-persist).
  The record then contains the access token + DPoP key + expiry, and
  `restoreSession()` resumes the session until the access token expires. Only refresh-token
  sessions never store the access token (unchanged principle: refresh token or nothing).
  Expiry on restore clears the record with an explicit `SebaSessionExpiredError`
  ("…the provider issued no refresh token…"). This keeps reload working against providers
  like solidcommunity.net, which advertise `offline_access` yet issue no refresh token
  (verified from a real token exchange).

### Added

- **Per-issuer compliance tolerances** (`tolerances?: Record<string, ComplianceTolerances>`).
  Relax `allowNonCompliantAudience` / the new `allowNonCompliantCnf` for one provider
  only while every other provider stays fully strict. Entries match the issuer exactly
  or modulo a trailing slash, and override the global boolean flags. Applications that
  talk to more than one provider should switch from the global flags to this.
- **`allowNonCompliantCnf`** (`SebaConfig` and `OIDCConfiguration`): escape hatch (same
  warn-once pattern) for providers whose ID tokens omit `cnf.jkt` while still issuing
  DPoP-bound access tokens (solidcommunity.net does exactly this). DPoP proofs remain
  mandatory on every request; a present `cnf.jkt` is still verified against the session
  key; signature, `iss`, `exp`/`iat`, `nonce`, `azp` and `client_id` audience checks stay on.
- **`error.stage`** — stable step identifier on every `SebaError` (`token-exchange`,
  `id-token-signature`, `id-token-audience`, `id-token-cnf-binding`,
  `authorization-response-*`, `network`, …) so applications/support can pinpoint where a
  login failed without parsing messages.
- **`maxDpopNonceRetries`** (default 1, previously hard-coded) for both the token-endpoint
  and the resource-fetch `use_dpop_nonce` challenge loops; providers rotating nonces on
  every request benefit from 2–3.
- **`account`** config option: per-account storage namespace (`seba:<account>` IndexedDB
  database plus a namespaced sessionStorage transaction key) enabling more than one
  concurrent session in the same browser profile.
- **`Seba.getSessionInfo()`** returns a token-free `{ webId, provider, accessTokenExpiresAt }`
  snapshot so applications can warn before the access token expires.
- **`Seba.completeLogin()`** completes a pending callback without falling back to starting
  a login — pairs with `Seba.isCallbackResponse(url?)` for the explicit
  "login() on click, completeLogin() on the callback route" pattern that avoids the
  never-settling redirect promise. `login()` itself still handles both roles.
- **MIGRATION.md** with a `@inrupt/solid-client-authn-browser` mapping.

### Fixed

- **`allowNonCompliantAudience` was dead code.** Declared on `SebaConfig` and read from the
  provider configuration during token validation, but never copied between the two: it is
  now carried through `resolveConfig` and stamped onto every discovered configuration at all
  three paths (login start, login completion, `SessionManager.discover`) via
  `applyComplianceTolerances`.
- **`SebaNetworkError` message** now names CORS as the first browser-side suspect, instead of
  only mentioning Node.js proxies.
- **logout without a provider revocation endpoint** now logs that the refresh token remains
  valid server-side until expiry, instead of silently returning.

## [0.3.1] — 2026-11-05

Fixes found during the first real-world login attempt against `solidcommunity.net`
(manual browser flow, tunnel-published Client ID Document;see the app's TEST_REPORT.md).

### Fixed

- **`allowNonCompliantAudience` was dead code.** The flag was declared on `SebaConfig`
  (types.d.ts:75) and documented as the opt-in for providers such as `solidcommunity.net`,
  and `checkIdTokenAudience` read it from the provider configuration object — but nothing
  ever copied it from the user's `Seba` config into that object. `resolveConfig` dropped
  the unknown key, and `discoverProvider` builds the configuration purely from the
  discovery document, so setting the flag had zero effect and the 0.2.1 hard-throw still
  fired. It is now carried through `resolveConfig` (`ResolvedConfig`) and stamped onto
  every discovered provider configuration at all three paths — login start (`#beginLogin`),
  login completion (`#completeLogin`) and the `SessionManager` `discover` callback that
  backs restore/refresh — via a new `applyComplianceTolerances` helper.

### Added

- **`allowNonCompliantCnf`** (`SebaConfig` and `OIDCConfiguration`), the same escape-hatch
  pattern as `allowNonCompliantAudience`, for providers whose ID tokens omit `cnf.jkt`
  while still issuing DPoP-bound access tokens (solidcommunity.net does exactly this:
  its ID token has no `cnf` claim). DPoP proofs remain mandatory on every request, an
  ID token that DOES carry `cnf.jkt` is still checked against the session key, and
  signature, `iss`, `exp`/`iat`, `nonce`, `azp` and the `client_id` audience checks all
  stay enforced. Warns once via `console.warn` when it suppresses the requirement.

## [0.2.1] — 2026-11-05

Documentation-only patch. No runtime behaviour changed; the only functional difference is
the wording of one error message.

### Fixed

- **Import paths in the shipped documentation.** The root entry point's JSDoc example still
  read `import { Seba } from "seba"`, a name that npm rejects, and the `SebaConfigError`
  thrown when the browser entry point runs without a DOM still told users to import
  `"seba"` / `"seba/node"`. Both now use `@gaballahtech/seba` and
  `@gaballahtech/seba/node`, and the browser/Node subpath JSDoc headers record their scoped
  names. These strings are what `dist/**/*.d.ts` and the runtime error expose to consumers,
  so 0.2.0 shipped documentation that could not be followed.

Persistence identifiers are deliberately unchanged: the IndexedDB database is still named
`seba` and the pending-authorization key is still `seba.pending-authorization`, so sessions
stored by 0.2.0 keep working after the upgrade.

## [0.2.0] — 2026-11-05

External validation and hardening release. This is not a claim of production readiness; the
gates that could not run are listed explicitly.

### Fixed because of external validation

- **Issuer canonicalization.** Real providers publish path-less issuers with a trailing
  slash (`https://solidcommunity.net/`, `https://solidweb.me/`, Community Solid Server's
  `http://localhost:3000/`). SEBA required byte-identical strings and rejected the document
  when the caller typed the host without the slash. Discovery now accepts that one
  canonical form and adopts the provider's exact spelling for all later comparisons;
  paths, ports, schemes and query strings still require exact equality. Verified against
  solidcommunity.net, solidweb.org, solidweb.me and CSS 7.3.0.

### Fixed from the manual security audit

- A refresh whose ID token fails validation (including a WebID that differs from the stored
  session) now clears the stored grant and throws `SebaSessionExpiredError`. It previously
  kept the unusable record and threw `SebaAuthError`, which would repeat the failure on
  every restore. Stricter, covered by a regression test.

### Added

- `tsconfig.examples.json`; `npm run typecheck` now typechecks `examples/` as well.
- `npm run typecheck:examples`, `npm run example:react:build`, `npm run validate:discovery`.
- Runnable React example scaffolding (`examples/react/index.html`, `main.tsx`,
  `vite.config.ts`) and an env-driven Node example.
- `scripts/validation/css-setup.mjs` and `css-flow.mjs`: a reproducible real-provider flow
  against a local Community Solid Server, including the account/pod setup and the browser
  interaction driven through CSS's JSON API.
- `scripts/validation/public-discovery.mjs`: discovery checks against public providers.
- `VALIDATION_REPORT.md`, this changelog, and a "Provider Compatibility" table in README.

### Changed

- **Package name.** `seba` → `@gaballahtech/seba`. npm rejected the unscoped name with
  `E403 Package name too similar to existing packages ses,send,eta,tebs,web3` and suggested
  the scoped alternative. The import path is now `@gaballahtech/seba`, with
  `@gaballahtech/seba/node` and `@gaballahtech/seba/browser` for the subpath entry points.
  All examples and documentation were updated. Version is unchanged at `0.2.0`.

### Validated externally

- Community Solid Server 7.3.0: discovery, Client ID Document fetch, PKCE/state/nonce
  authorization, consent, callback, DPoP token request and token response all succeeded.
  Login stops at ID token validation because CSS emits a string `aud` without `"solid"` and
  no `cnf` claim, which Solid-OIDC §8.1 requires.
- solidcommunity.net, solidweb.org and solidweb.me: discovery and issuer handling verified
  through SEBA's real discovery code; the first two publish trailing-slash issuers, which
  exposed the normalization bug fixed above.
- One real CSS failure was caused by **provider non-compliance**, not by Seba: CSS 7.3.0
  emits `id_token.aud` as a string without `"solid"` and omits `cnf.jkt`, contrary to
  Solid-OIDC §8.1. The failure is documented in `CSS_ISSUE.md` and reported upstream.

### Not validated (explicitly)

- No full login → fetch → restore → logout cycle against any public provider: creating an
  account requires an interactive browser, email and, on some deployments, a CAPTCHA.
- No browser end-to-end run. Chrome is installed, Firefox/Safari are not. The 5-step browser
  matrix was not executed.
- Safari `CryptoKey` persistence and IndexedDB private-browsing behaviour were not executed.
- IndexedDB quota-exceeded and corrupted-record behaviour in a real browser was not
  executed; the unit tests cover the adapter and the failure paths.
- No real pod resource was fetched with a CSS-issued token (blocked by the ID token issue).
