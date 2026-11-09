# HUMAN_DECISIONS

## HD-1 — Tolerance acknowledgement flag (Task 8, potential breaking config change)
- **Decision:** Task 8 requires “Every tolerance requires an explicit acknowledgement flag; omitting it throws SebaConfigError”. This changes behavior for existing configs that set `allowNonCompliantAudience`/`allowNonCompliantCnf`/per-issuer tolerances without the new ack.
- **Options:** (A, recommended) Add `acknowledgeSecurityRelaxations: true` (or per-tolerance ack shape) as required when any tolerance is enabled; document in MIGRATION.md + SECURITY.md; keep effects unchanged. (B) Make ack optional with loud warning (weaker than task spec). (C) New `tolerancesAcknowledged` per issuer.
- **Status:** **RESOLVED-KEEP (Round 2, Task 1.1).** Implemented as `acknowledgeSecurityRelaxations: true` (A-like). Migration/SECURITY/ADR 0003 document the breaking config contract. Revisit only with an explicit human decision for per-tolerance/per-issuer ack shape.

## HD-2 — Real-provider E2E credentials (Task 1)
- **Decision:** Solidweb.org “automated (live)” in CI requires real account credentials and stable non-interactive login path (or refresh-token fixture) — not available in repo.
- **Options:** (A, recommended) Implement local fixture server E2E (automated) + optional live test gated by env vars (skipped in CI without secrets), document solidweb as “manual (documented)” unless secrets provided. (B) Do not claim solidweb automated.
- **Status:** **RESOLVED-MANUAL (Round 2, Task 1.2).** README provider table states: automated (fixture); manual (live, gated by `SEBA_E2E_SOLIDWEB=1`). Live automation requires secrets/non-interactive flow (admin).

## HD-3 — GitHub protected environment / branch protection / npm token (Tasks 2,19)
- **Decision:** `release.yml` environment `npm-publish`, `id-token` provenance publish, and required branch-protection checks need GitHub repo admin settings and npm/org config I cannot change.
- **Options:** (A) Merge workflows; admin configures environment + required checks per PR body. (B) Defer release workflow.
- **Status:** **DOCUMENTED — awaiting admin (Round 2, Task 1.3).** `CONTRIBUTING.md` includes “Branch protection & release environment” (required checks: typecheck, test, coverage, e2e, publint, build, size; required PR review 1; signed commits; protected environment `npm-publish` with required reviewers + `NPM_TOKEN`). Not applied from this environment.

## HD-4 — Exact dependency pins (Task 2)
- **Decision:** Dropping `^` from `jose`/`idb` reduces surprise updates but changes update behavior.
- **Options:** (A, prescribed) Pin exact versions currently resolved. (B) Keep ranges and rely on lockfile (conflicts with task).
- **Status:** **RESOLVED-KEEP (Round 2, Task 1.4).** `jose@6.2.15` and `idb@8.0.4` remain exact-pinned in `package.json`. Upgrade via reviewed PRs.

## HD-5 — SSR “partial support” new entry point (Task 10)
- **Decision:** If SSR requires a new export/entry point, that’s a public API surface decision.
- **Options:** (A) Document unsupported/constraints + Next.js example using browser-only patterns. (B) Add SSR-safe entry point.
- **Status:** **RESOLVED-BROWSER-ONLY (Round 2, Task 1.5).** Option A chosen; `docs/adr/0005-ssr-stance.md` records the decision. No SSR entry point added; Task 10 delivers README + example.
