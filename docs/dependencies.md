# Dependencies

## Runtime

- `jose` — pinned to an exact version in `package.json` (no `^`) to reduce supply-chain drift. Upgrade deliberately: review changelog/advisories, run full test suite + e2e, update lockfile.
- `idb` — pinned to an exact version for the same reason.

## Update policy

1. Dependabot opens weekly grouped PRs (`.github/dependabot.yml`). **Auto-merge for major bumps is disabled.**
2. For any dependency change: run `npm ci`, `npm run typecheck`, `npm test`, `npm run test:coverage`, `npm run test:e2e` (where relevant), `npm run build`, `npm run check:exports`, and `npm audit --omit=dev --audit-level=high`.
3. Review the lockfile diff; do not accept unexpected transitive changes without understanding them.

## CVE triage

1. **Detect:** CI runs `npm audit --omit=dev --audit-level=high` as a required check (see `.github/workflows/ci.yml`). Dependabot security updates may also open PRs.
2. **Assess:** Confirm the vulnerability affects the versions/paths actually used by this package (production vs dev-only, reachable code paths). Record the advisory ID and affected version.
3. **Remediate:** Upgrade to a fixed version (or patch). For runtime deps (`jose`, `idb`), treat as high priority and verify Solid-OIDC/DPoP behavior with tests.
4. **If no fix exists:** Document in the issue/PR, evaluate mitigations or temporary pin with compensating controls, and escalate via `HUMAN_DECISIONS.md` if release is blocked.
5. **Release:** Follow `RELEASING.md`; include security notes in `CHANGELOG.md` when user impact exists.
