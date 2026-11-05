# Changelog

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
