# Releasing and versioning

## SemVer / stability

`@gaballahtech/seba` follows [Semantic Versioning](https://semver.org/).

- **Core API** (`Seba`, core errors, session/login/fetch behavior, types used by the core): treated as **stable** within a major version. Breaking changes require a major bump and migration notes.
- **Convenience surfaces** (`<seba-login>` custom element, React helpers, `./pod` helpers, CLI): supported, but may evolve faster when improving UX/safety. Breaking changes still require a major bump.
- **Security fixes** may ship in patch/minor releases; hardening changes that alter insecure behavior are documented in `CHANGELOG.md`.

## Path to 1.0

Before/at 1.0:
- Confirm the public API surface and export map are final for the 1.x line.
- Apply any deferred **breaking** packaging cleanups (e.g., refactor the legacy `pkg.browser` object to rely solely on `exports` conditions, per `publint` suggestion) with migration notes.
- Keep provider-compatibility and security docs current (`SECURITY.md`, README provider table).

## Publishing checklist

1. `npm ci`
2. `npm run typecheck && npm test && npm run build`
3. `npm run check:exports` (`publint`, required) — resolve errors; review suggestions. `attw` runs best-effort in CI (it currently crashes on this package’s export/pack shape; investigate before making it a hard gate).
4. Update `CHANGELOG.md` (move Unreleased items under the new version/date)
5. Bump `version` in `package.json` (and lockfile via `npm install` if needed)
6. `npm pack --dry-run` — verify contents (no `examples/react/dist`, no secrets/dev cruft)
7. Publish with provenance when using CI/Trusted Publishing (`npm publish --provenance --access public` as appropriate for your setup)

## CI

GitHub Actions runs typecheck, tests, build, and `publint`. Coverage can be run locally via `npm run test:coverage`.
