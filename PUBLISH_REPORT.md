# PUBLISH_REPORT — @gaballahtech/seba 0.2.0

Date: 2026-11-05
Environment: Linux container, Node.js v26.12.1, npm 12.2.1, registry `https://registry.npmjs.org/`.
GitHub identity available on the machine: `gaballahtech` (token used via API, never printed).
npm authentication: **absent at the time of §1** (`~/.npmrc` contained only `prefix` and
`allow-scripts`; no `_authToken`, and `npm whoami` failed with `need auth`). Authentication
was configured later as `gaballahtech`; see the published section below.

## v0.2.0 — Published as @gaballahtech/seba

**Status: published.** `npm whoami` → `gaballahtech`. This section records the successful
publish and supersedes the "Not published" summary in §5, which documents the earlier
unauthenticated attempt.

### Why the name changed

The first publish used the unscoped name `seba` and the registry rejected it:

```
npm error code E403
npm error 403 Package name too similar to existing packages ses,send,eta,tebs,web3; try renaming your package to '@gaballahtech/seba' and publishing with 'npm publish --access=public' instead
```

npm blocks new unscoped names that are easily confused with existing packages, and the
registry itself returned the scoped alternative. The package was therefore renamed to
`@gaballahtech/seba` with the version unchanged at `0.2.0`; the unscoped name was not
retried and no `--force` was used.

### Rename footprint

- `package.json` → `"name": "@gaballahtech/seba"`; the two `name` fields in
  `package-lock.json` follow it.
- Import/install references updated in `README.md` (`npm install …`, `import … from`),
  `examples/node/index.ts` (`@gaballahtech/seba/node`), `examples/react/App.tsx`,
  `ARCHITECTURE.md` (entry-point names) and `tsconfig.examples.json` (the `paths` aliases
  for all three entry points).
- `src/` and `tests/` were **not** modified, per the task rules. Consequence: the JSDoc
  example in `src/index.ts` and the runtime message in `src/browser/platform.ts`
  (`Import "seba" in a browser or "seba/node" in Node.js.`) still spell the old name. Both
  are cosmetic text, they ship in `dist/`, and they are the only remaining stale references.

### Gates re-run after the rename

```
npm run typecheck   → TYPECHECK_EXIT=0   (tsconfig.json and tsconfig.examples.json)
npm test            → Test Files 9 passed (9) / Tests 123 passed (123), TEST_EXIT=0
npm run build       → BUILD_EXIT=0
npm pack --dry-run  → name: @gaballahtech/seba, version: 0.2.0, 86 files, 98.7 kB / 377.6 kB
```

### `npm publish --access=public` (actual output)

```
npm notice
npm notice 📦  @gaballahtech/seba@0.2.0
npm notice Tarball Contents
npm notice 15.6kB ARCHITECTURE.md
npm notice 9.0kB BUILD_REPORT.md
npm notice 3.4kB CHANGELOG.md
npm notice 1.1kB LICENSE
npm notice 11.1kB README.md
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
npm notice 2.2kB package.json
npm notice Tarball Details
npm notice name: @gaballahtech/seba
npm notice version: 0.2.0
npm notice filename: gaballahtech-seba-0.2.0.tgz
npm notice package size: 98.7 kB
npm notice unpacked size: 377.6 kB
npm notice shasum: 668a9df069be639ad52d0ae7e7e05a6b048a6e46
npm notice integrity: sha512-Z6wbU+jeNaTw8[...]SkTs9ydoaGHqw==
npm notice total files: 86
npm notice
npm notice Publishing to https://registry.npmjs.org/ with tag latest and public access
npm notice Your package is being processed and may take a few minutes to become available.
+ @gaballahtech/seba@0.2.0
PUBLISH_EXIT=0
```

The registry acknowledged the upload with `PUT https://registry.npmjs.org/@gaballahtech%2fseba
202 Accepted`. For a new package that is a "processing" state: `npm view` returned 404 for
roughly two minutes afterwards, then resolved.

### `npm view @gaballahtech/seba@0.2.0` (actual output)

```

@gaballahtech/seba@0.2.0 | MIT | deps: 2 | versions: 2
Developer-friendly Solid-OIDC authentication: login, session restoration and DPoP-signed fetch in four methods.
https://github.com/gaballahtech/seba#readme

keywords: solid, solid-oidc, oidc, oauth2, dpop, pkce, webid, authentication

dist
.tarball: https://registry.npmjs.org/@gaballahtech/seba/-/seba-0.2.0.tgz
.shasum: 668a9df069be639ad52d0ae7e7e05a6b048a6e46
.integrity: sha512-Z6wbU+jeNaTw8HpquJiKQtORxWyYPcSPJhSUR71jGVsj6N2GvX/YOt+NOzIe6gZTuGFmYBcSYSkTs9ydoaGHqw==
.unpackedSize: 377.6 kB

dependencies:
idb: ^8.0.3, jose: ^6.1.0

maintainers:
- gaballahtech <abdelrahman.gaballah.tech@gmail.com>

dist-tags:
latest: 0.2.0

published 48 seconds ago by gaballahtech <abdelrahman.gaballah.tech@gmail.com>
VIEW_EXIT=0
```

### Published tarball

- URL: `https://registry.npmjs.org/@gaballahtech/seba/-/seba-0.2.0.tgz` (HTTP 200)
- `shasum`: `668a9df069be639ad52d0ae7e7e05a6b048a6e46`
- `integrity`: `sha512-Z6wbU+jeNaTw8HpquJiKQtORxWyYPcSPJhSUR71jGVsj6N2GvX/YOt+NOzIe6gZTuGFmYBcSYSkTs9ydoaGHqw==`
- The tarball's `package/package.json` reports `"name": "@gaballahtech/seba"` and
  `"version": "0.2.0"`.
- `dist-tags.latest` is `0.2.0`. The packument also lists `0.0.0-stage`, a pre-release that
  predates this publish; `latest` points at `0.2.0`.

### Public install command

```bash
npm install @gaballahtech/seba
```

Subpath entry points are `@gaballahtech/seba/node` and `@gaballahtech/seba/browser`.

## 1. Gate commands (actual output, in the required order)

### `npm install`

```
up to date, audited 49 packages in 1s
INSTALL_EXIT=0
```

### `npm run typecheck`

```
TYPECHECK_EXIT=0
```

(No compiler output; both `tsconfig.json` and `tsconfig.examples.json` pass.)

### `npm test`

```
 Test Files  9 passed (9)
      Tests  123 passed (123)
TEST_EXIT=0
```

### `npm run build`

```
BUILD_EXIT=0
```

### `npm pack --dry-run`

```
npm notice name: seba
npm notice version: 0.2.0
npm notice filename: seba-0.2.0.tgz
npm notice package size: 98.6 kB
npm notice unpacked size: 377.5 kB
npm notice total files: 86
PACK_EXIT=0
```

The tarball contains `README.md`, `CHANGELOG.md`, `BUILD_REPORT.md`, `SECURITY.md`,
`VALIDATION_REPORT.md`, `LICENSE`, `dist/` and `examples/`; it does not contain
`node_modules`, tests, `css-data`, `CSS_ISSUE.md` or `PUBLISH_REPORT.md`.

### `npm publish --access public`

```
npm notice name: seba
npm notice version: 0.2.0
npm notice filename: seba-0.2.0.tgz
npm notice package size: 98.6 kB
npm notice unpacked size: 377.5 kB
npm notice total files: 86
npm error code ENEEDAUTH
npm error need auth This command requires you to be logged in to https://registry.npmjs.org/
npm error need auth You need to authorize this machine using `npm login`
npm error A complete log of this run can be found in: /home/gaballahtech/.npm/_logs/2026-11-05T08_52_36_640Z-debug-0.log
PUBLISH_EXIT=1
```

**Not retried**, per the task rules. No `--force`, no `--ignore-scripts`.

### Gate 1 — `npm view seba@0.2.0`

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/seba - Not found
npm error 404  The requested resource 'seba@0.2.0' could not be found or you do not have permission to access it.
VIEW_EXIT=1
```

**Gate 1 is BLOCKED, not green.** The package is not on the registry. The 404 also indicates
the name `seba` had no published package at the time of the check, but the definitive
availability check can only happen with an authenticated account at publish time.

## 2. CSS upstream issue

Filed with the GitHub API using the machine's `gaballahtech` token:

**https://github.com/CommunitySolidServer/CommunitySolidServer/issues/2295**

Title: “ID token aud claim missing 'solid' audience and cnf.jkt per Solid-OIDC §8.1”.
State at creation: `open`. Body source: `CSS_ISSUE.md` (repo root, intentionally not packed).

## 3. Required manual action to publish

On a machine logged in to npm as the package owner:

```bash
npm login                     # or set //registry.npmjs.org/:_authToken in ~/.npmrc
npm publish --access public   # from /home/gaballahtech/Projects/seba
npm view seba@0.2.0
```

The tarball is already built and verified; no source change is needed. If npm rejects the
name at publish time, the exact error must be recorded here before choosing another name.

## 4. Other notes

- `package.json` now sets `author: "gaballahtech"`, `repository`, `homepage` and `bugs` to
  `https://github.com/gaballahtech/seba`. That GitHub repository currently returns HTTP 404
  (it has not been created), so the repository link will be broken until it exists. It was
  not created automatically because the task did not ask for a new public repository.
- `CSS_ISSUE.md` is deliberately excluded from the npm tarball (not listed in `files`).
- The README warning block links to issue 2295 and tells readers not to weaken validation.

## 5. Honest summary (historical — superseded by the published section above)

**Not published (npm authentication missing). Not production-ready. CSS non-compliance
documented and reported upstream at issue 2295; Seba's rejection is correct per Solid-OIDC
§8.1.**
