# PROGRESS

Snapshot of the v1.x workstream. Status reflects what is verifiable in the repository
today; external/admin items are marked as such. This file is a snapshot, not a live board.

| Task | Status | Verification command | Notes |
|---|---|---|---|
| 0 Explore/Plan | DONE | `ls`, `read`, `grep` | Surface map in `PLAN.md` |
| 1 E2E suite | DONE | `npm run test:e2e` | Fixture suites pass; live solidweb test is env-gated (`SEBA_E2E_SOLIDWEB=1`). CI run URL blocked (admin). |
| 2 Provenance | DONE* | `npm audit --omit=dev --audit-level=high`; release workflow | `publishConfig.provenance: true`; activation requires npm/GitHub admin (HD-3). |
| 3 Pending cleanup | DONE | `npm test -- tests/unit/client-pending-cleanup.test.ts` | `src/core/client.ts` clears pending auth in `finally`. |
| 4 Restore errors | DONE | `npm test -- tests/unit/session-restore.test.ts` | Storage load errors map to `SebaSessionExpiredError(stage=storage_unavailable)`. |
| 5 Coverage gate | DONE | `npm run test:coverage` | Core gated 85/80; beta floors measured. See `vitest.config.ts`. |
| 6 Session negatives | DONE | `npm test -- tests/unit/session.test.ts` | Terminal vs. transient refresh failures distinguished. |
| 7 Redirect leak test | DONE | `npm test -- tests/security/redirect-no-credential-leak.test.ts` | Wire-level no-leak + control. |
| 8 Tolerances safeguards | DONE | `npm test -- tests/unit/oidc.test.ts tests/unit/session-tolerance.test.ts` | Ack flag enforced; `tolerance-applied` event deduplicated. |
| 9 CVE monitoring | DONE | `npx yaml-lint .github/dependabot.yml` | Dependabot weekly grouped; no major auto-merge. |
| 10 SSR stance | DONE | `docs/adr/0005-ssr-stance.md`; `examples/nextjs/` | Browser-only stance; Next.js client-component + proxy example. |
| 11 Bundle size | DONE | `npm run size` | Per-entry packed/gzip sizes with budgets; run in CI. |
| 12 Provider compat automation | DONE | `npm run validate:discovery`; `.github/workflows/provider-compat.yml` | Discovery-only checks (`compat/providers.json`); no login/token/resource fetch. |
| 13 Pending TTL docs | DONE | `grep -n "Pending auth TTL" README.md` | 10-minute TTL documented in README. |
| 14 IDB eviction UX | TODO | — | Not implemented: no storage-health/eviction UX yet. |
| 15 Refresh timing docs | DONE | `grep -n "Token Refresh Timing" README.md` | `EXPIRY_SKEW_MS`, proactive + reactive refresh documented. |
| 16 Node flow tests | PARTIAL | `npm test` | `src/node/platform.ts` has no dedicated test suite; exercised only indirectly. |
| 17 Persist-without-refresh default | DONE | `docs/adr/0004-persist-without-refresh-token.md` | `persistSessionWithoutRefreshToken` (`auto`/`never`). |
| 18 README evidence table | DONE | `grep -n "Evidence status" README.md` | Claims linked to code/tests/workflows. |
| 19 CI required checks | DONE | `.github/workflows/ci.yml` | typecheck, test, build, publint, audit, coverage, size. |
| 20 ADRs | DONE | `ls docs/adr \| wc -l` | Six ADRs (0001–0006). |

\* DONE subject to admin/npm setup (HD-3); not verifiable from this environment.