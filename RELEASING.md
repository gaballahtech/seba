# Releasing and versioning

## SemVer / stability

`@gaballahtech/seba` follows [Semantic Versioning](https://semver.org/).

- **Core API** (`Seba`, core errors, session/login/fetch behavior, types used by the core, `@gaballahtech/seba`): **stable** for the 1.x line. Breaking changes require a major bump and migration notes.
- **BETA surfaces** (`@gaballahtech/seba/react`, `<seba-login>` web component/element integration, `@gaballahtech/seba/node`, browser integration surface): supported, but **not production-grade** and may evolve faster while BETA. Breaking changes still require a major bump and migration notes.
- **Security fixes** may ship in patch/minor releases; hardening changes that alter insecure behavior are documented in `CHANGELOG.md`.

See [`docs/stability.md`](./docs/stability.md).

## 1.x notes

The 1.x API/export map is the current public line. If a future release refactors the legacy `pkg.browser` object to rely solely on `exports` conditions (a `publint` suggestion, not a blocking error today), treat it as a breaking packaging change with migration notes unless it remains fully compatible.

## Publishing checklist

1. `npm ci`
2. `npm run typecheck && npm test && npm run build`
3. `npm run check:exports` (`publint`, required) — resolve errors; review suggestions. `attw` runs best-effort in CI (it currently crashes on this package’s export/pack shape; investigate before making it a hard gate).
4. `npm run size` — verify the browser gzip budget still passes.
5. Update `CHANGELOG.md` (move Unreleased items under the new version/date) and update release notes under `docs/release-notes/` if applicable.
6. Bump `version` in `package.json` and `package-lock.json` (`npm version <patch|minor|major> --no-git-tag-version`, or edit + `npm install --package-lock-only`).
7. `npm pack --dry-run` — verify contents (no dev cruft/secrets; intended examples/assets/docs present).
8. Commit the release, push the branch, and push a tag `vX.Y.Z`.

## GitHub Actions release

[`.github/workflows/release.yml`](./.github/workflows/release.yml) publishes on pushed tags matching `v*` using Node 24 and the `npm-publish` GitHub environment.

It supports two authentication paths:
- **npm Trusted Publishing (OIDC, preferred):** configure a Trusted Publisher for `@gaballahtech/seba` on npmjs.com (GitHub Actions: owner `gaballahtech`, repo `seba`, workflow `release.yml`, environment `npm-publish`). Requires `id-token: write` (present) and npm CLI compatible with Trusted Publishing (Node 24 in CI).
- **Automation token:** set `NPM_TOKEN` as a secret available to the `npm-publish` environment.

The publish step is **idempotent**: if `@gaballahtech/seba@<version>` is already on npm, it skips `npm publish` and exits successfully.

## Provenance / admin requirements

`package.json` sets `publishConfig.provenance: true` and CI publishes with `--provenance`. Trusted Publishing/provenance activation and the protected `npm-publish` environment (reviewers/rules) require repository/npm admin setup (see `docs/release-notes/v1.0.md` external items). A real publish cannot be fully verified by code changes alone.
