# BUILD_REPORT — seba 0.2.0

Date: 2026-11-05
Environment: Linux container, Node.js v26.12.1, npm 12.2.1, TypeScript 5.9.3, Vitest 5.1.0,
Vite 8.3.6. Chrome binary present; no Firefox/Safari.

## 1. Gate results (actual, in the required order)

| Gate | Command | Exit | Result |
|---|---|---|---|
| Install | `npm install` | 0 | 0 vulnerabilities |
| Typecheck | `npm run typecheck` = `tsc --noEmit && tsc -p tsconfig.examples.json` | 0 | No errors in `src/`, `tests/` or `examples/` |
| Tests | `npm test` | 0 | 9 files, **123/123** tests passed |
| Build | `npm run build` | 0 | `dist/` emitted |
| Pack | `npm pack --dry-run` | 0 | `seba-0.2.0.tgz`, 86 files, 97.8 kB packed, 373.7 kB unpacked |

Test summary as printed:

```
 Test Files  9 passed (9)
      Tests  123 passed (123)
```

Coverage changed since 0.1.0: discovery gained three issuer-canonicalization tests and the
session suite's "different WebID on refresh" test now expects the stricter
`SebaSessionExpiredError` + cleared storage behaviour.

## 2. `npm pack --dry-run` output

Captured from the final gate run (the listing was taken immediately before this report's
last wording change, so this file's own byte count differs by less than 1 kB; the pack was
re-run after writing it and again included `BUILD_REPORT.md` and exited 0):

```
npm notice 📦  seba@0.2.0
npm notice Tarball Contents
npm notice 15.6kB ARCHITECTURE.md
npm notice 6.1kB BUILD_REPORT.md
npm notice 3.1kB CHANGELOG.md
npm notice 1.1kB LICENSE
npm notice 10.7kB README.md
npm notice 11.7kB RESEARCH.md
npm notice 16.9kB SECURITY.md
npm notice 10.1kB VALIDATION_REPORT.md
npm notice 325B dist/browser/index.d.ts
npm notice 191B dist/browser/index.d.ts.map
npm notice 323B dist/browser/index.js
npm notice 189B dist/browser/index.js.map
npm notice 517B dist/browser/platform.d.ts
npm notice 282B dist/browser/platform.d.ts.map
npm notice 2.8kB dist/browser/platform.js
npm notice 2.1kB dist/browser/platform.js.map
npm notice 609B dist/browser/provider-modal.d.ts
npm notice 255B dist/browser/provider-modal.d.ts.map
npm notice 5.6kB dist/browser/provider-modal.js
npm notice 4.1kB dist/browser/provider-modal.js.map
npm notice 1.4kB dist/browser/storage.d.ts
npm notice 526B dist/browser/storage.d.ts.map
npm notice 4.3kB dist/browser/storage.js
npm notice 3.2kB dist/browser/storage.js.map
npm notice 2.1kB dist/core/client.d.ts
npm notice 630B dist/core/client.d.ts.map
npm notice 15.3kB dist/core/client.js
npm notice 12.3kB dist/core/client.js.map
npm notice 3.8kB dist/core/discovery.d.ts
npm notice 900B dist/core/discovery.d.ts.map
npm notice 11.5kB dist/core/discovery.js
npm notice 7.0kB dist/core/discovery.js.map
npm notice 2.4kB dist/core/dpop.d.ts
npm notice 979B dist/core/dpop.d.ts.map
npm notice 5.8kB dist/core/dpop.js
npm notice 4.7kB dist/core/dpop.js.map
npm notice 3.5kB dist/core/errors.d.ts
npm notice 1.5kB dist/core/errors.d.ts.map
npm notice 3.7kB dist/core/errors.js
npm notice 2.1kB dist/core/errors.js.map
npm notice 3.0kB dist/core/http.d.ts
npm notice 1.1kB dist/core/http.d.ts.map
npm notice 4.6kB dist/core/http.js
npm notice 3.0kB dist/core/http.js.map
npm notice 6.1kB dist/core/identity.d.ts
npm notice 2.0kB dist/core/identity.d.ts.map
npm notice 28.3kB dist/core/identity.js
npm notice 23.5kB dist/core/identity.js.map
npm notice 6.4kB dist/core/oidc.d.ts
npm notice 3.1kB dist/core/oidc.d.ts.map
npm notice 18.3kB dist/core/oidc.js
npm notice 14.1kB dist/core/oidc.js.map
npm notice 4.8kB dist/core/session.d.ts
npm notice 1.9kB dist/core/session.d.ts.map
npm notice 13.7kB dist/core/session.js
npm notice 9.7kB dist/core/session.js.map
npm notice 1.0kB dist/core/storage.d.ts
npm notice 401B dist/core/storage.d.ts.map
npm notice 1.4kB dist/core/storage.js
npm notice 891B dist/core/storage.js.map
npm notice 706B dist/index.d.ts
npm notice 443B dist/index.d.ts.map
npm notice 279B dist/index.js
npm notice 286B dist/index.js.map
npm notice 317B dist/node/index.d.ts
npm notice 188B dist/node/index.d.ts.map
npm notice 315B dist/node/index.js
npm notice 186B dist/node/index.js.map
npm notice 1.2kB dist/node/platform.d.ts
npm notice 331B dist/node/platform.d.ts.map
npm notice 7.2kB dist/node/platform.js
npm notice 4.7kB dist/node/platform.js.map
npm notice 1.6kB dist/seba.d.ts
npm notice 542B dist/seba.d.ts.map
npm notice 2.1kB dist/seba.js
npm notice 1.2kB dist/seba.js.map
npm notice 10.8kB dist/types.d.ts
npm notice 4.3kB dist/types.d.ts.map
npm notice 274B dist/types.js
npm notice 115B dist/types.js.map
npm notice 2.2kB examples/node/index.ts
npm notice 3.7kB examples/react/App.tsx
npm notice 299B examples/react/index.html
npm notice 319B examples/react/main.tsx
npm notice 644B examples/react/vite.config.ts
npm notice 1.9kB package.json
npm notice Tarball Details
npm notice name: seba
npm notice version: 0.2.0
npm notice filename: seba-0.2.0.tgz
npm notice package size: 97.8 kB
npm notice unpacked size: 373.7 kB
npm notice total files: 86
```

The tarball contains `README.md`, `CHANGELOG.md`, `BUILD_REPORT.md`, `SECURITY.md`,
`VALIDATION_REPORT.md`, `dist/` and `examples/`. It contains **no** `node_modules`, no test
files or fixtures, and no `css-data` directory. The generated `examples/react/dist` bundle
was removed before this run; the React example ships as sources plus its Vite config.

## 2b. v0.2.0 external validation status

> **v0.2.0 external validation status:**
> - Local CSS 7.3.0: login **fails at ID token validation** due to CSS non-compliance (see CSS_ISSUE.md). Seba's rejection is correct per Solid-OIDC §8.1.
> - Public providers: discovery tested against `solidcommunity.net`, `solidweb.org`, `solidweb.me`. Full cycle not completed (account creation requires interactive browser). Trailing-slash issuer bug fixed.
> - Browsers: unit tests for browser storage pass; no real-browser E2E performed.
> - This release is **not** claimed production-ready. See `VALIDATION_REPORT.md`.

Upstream report: https://github.com/CommunitySolidServer/CommunitySolidServer/issues/2295

## 3. External validation summary

Full transcripts, error messages and blockers are in `VALIDATION_REPORT.md`.

- **Community Solid Server 7.3.0 (real):** discovery, Client ID Document fetch,
  PKCE/state/nonce, account/WebID/consent interaction, callback, and the DPoP token request
  all succeeded. The login is rejected at ID token validation because CSS issues
  `aud` as a string containing only the client ID (no `"solid"`) and no `cnf` claim;
  Solid-OIDC §8.1 requires an array with `"solid"` and a `cnf` binding. The library was not
  weakened to accommodate a non-conformant provider.
- **Public providers:** discovery through SEBA's real code succeeded for
  `solidcommunity.net` (issuer `https://solidcommunity.net/`), `solidweb.org` (issuer
  `https://solidweb.org`, no revocation endpoint) and `solidweb.me` (issuer
  `https://solidweb.me/`). No account could be created, so no public full cycle is claimed.
- **Browser:** not executed. Chrome is installed but Firefox/Safari are not, and a real
  provider login is blocked as above. No browser matrix is claimed green.
- **Examples:** `tsc -p tsconfig.examples.json` and `vite build` succeed; runtime login is
  blocked by the provider issue.

## 4. Changes made because of validation

1. **Issuer canonicalization** (`src/core/discovery.ts`): accept the empty-path
   trailing-slash form of a path-less issuer and adopt the provider's exact spelling for
   all later comparisons. Motivated by real providers (solidcommunity.net, solidweb.me,
   CSS). Paths, ports, schemes and query strings still require exact equality. Three tests
   added.
2. **Refresh identity mismatch is terminal** (`src/core/session.ts`): refresh-time ID token
   validation failure now clears storage and throws `SebaSessionExpiredError` instead of
   leaving an unusable grant. Stricter; regression test updated.
3. **Examples in the typecheck graph** (`tsconfig.examples.json`, package scripts), plus
   runnable Vite scaffolding for the React example and an env-driven Node example.
4. Docs reconciled with reality: provider compatibility table, security audit findings,
   validation report, changelog, version 0.2.0.

## 5. Still unvalidated (explicit)

- Full login → fetch → restore → logout against any public provider (no account).
- Any real-browser run (no Firefox; no provider login that reaches a session).
- Safari `CryptoKey` persistence and private-browsing IndexedDB behaviour.
- IndexedDB quota-exceeded and corrupted-record handling in a real browser (unit-covered,
  not browser-executed).
- Real pod resource access with a provider-issued access token (blocked at ID token).
- No automated accessibility audit of the browser dialog.

## 6. Release notes

Version bumped to `0.2.0`. This is a validation release with one interop fix and one
security hardening change; it is **not** “production ready” in the sense of having passed
real-provider and browser gates, and no document here claims that.
