# PROGRESS

| Task | Status | Commit SHA | Verification command | Evidence line | Notes |
|---|---|---|---|---|---|
| 0 Explore/Plan | DONE | (working tree) | `ls`, `read_files`, `grep` on 2026-11-09 | Surface map in `PLAN.md` | Branch `docs/fix-readme-badges` @ `94968b4` |
| 1 E2E suite | DONE* | (working tree) | `npm run test:e2e` | 5 passed, 1 skipped (6) | *CI run URL BLOCKED; Target A manual/documented per DO NOT |
| 2 Provenance | DONE* | (working tree) | `node -e publishConfig` + `npx yaml-lint release.yml` + `npm audit --omit=dev --audit-level=high` | publishConfig ok; YAML Lint successful; found 0 vulnerabilities | *GH env/branch-protection/NPM secrets BLOCKED (admin) |
| 3 Pending cleanup | DONE | (working tree) | `npm test -- tests/unit/client-pending-cleanup.test.ts` | 4 passed (4) | `src/core/client.ts` try/finally |
| 4 Restore errors | DONE | (working tree) | `npm test -- tests/unit/session-restore.test.ts` | 5 passed (5) | maps storage load errors to `SebaSessionExpiredError(stage=storage_unavailable)` |
| 5 Coverage gate | BLOCKED | (working tree) | `npm run test:coverage` | thresholds enforced but unmet (global 59.96% lines/58.79% branches; core client/oidc/session branches below 90%) | structural config/CI/baseline done; needs tests (no threshold lowering) |
| 6 Session negatives | DONE | (working tree) | `npm test -- tests/unit/session.test.ts` | 19 passed (19) | cases explicit w/ file:line (see report) |
| 7 Redirect leak test | DONE | (working tree) | `npm test -- tests/security/redirect-no-credential-leak.test.ts` | 2 passed (2) | wire-level no leak + control |
| 8 Tolerances safeguards | PARTIAL | (working tree) | `npm test -- tests/unit/oidc.test.ts` | 37 passed (37) | ack throws, type/event reason, callback hook, SECURITY/ADR/MIGRATION; full session-changed emission wiring across session.ts refresh path out of T8 scope |
| 9 CVE monitoring | DONE | (working tree) | `npx yaml-lint .github/dependabot.yml` + `test -f docs/dependencies.md` | YAML Lint successful; deps-doc-ok | Dependabot weekly grouped, no major auto-merge |
| 10 SSR stance | TODO | | per task | | P1 not executed in this pass |
| 11 Bundle size | TODO | | `npm run size` | | P1 not executed in this pass |
| 12 Provider compat automation | TODO | | `npm run validate:discovery` / yaml | | P2 |
| 13 Pending TTL docs | TODO | | `grep -n "pending" README.md` | | P2 |
| 14 IDB eviction UX | TODO | | `npm test -- tests/unit/storage-health.test.ts` | | P2 |
| 15 Refresh timing docs | TODO | | `grep -n "Session lifecycle" README.md` | | P2 |
| 16 Node flow | TODO | | `npm test -- tests/node/**` | | P2 |
| 17 Persist-without-refresh default | TODO | | `test -f docs/adr/0004-persist-without-refresh-token.md` | | P2 |
| 18 README evidence table | TODO | | `grep -n "Evidence status" README.md` | | P3 |
| 19 CI required checks | TODO | | PR checks | | P3 (external config) |
| 20 ADRs | TODO | | `ls docs/adr/ \| wc -l` | | P3 |
