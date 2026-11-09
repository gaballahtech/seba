# PLAN — seba v0.5.x hardening (P0–P3)

## Goal
Deliver the P0/P1 hardening contracts for `@gaballahtech/seba` with deterministic verification; complete P2/P3 where feasible and record truthful BLOCKED/PARTIAL status where access or human decisions are required.

## Surface map (explored this session)
[Confirmed] `package.json:1-135` — v0.5.15, ESM, scripts (`build`, `typecheck`, `test`, `test:coverage`, `check:exports`, `validate:discovery`), deps `idb ^8.0.3` / `jose ^6.1.0`, Node >=20.  
[Confirmed] `vitest.config.ts:1-17` — `include: ["tests/**/*.test.ts"]`, node env, v8 coverage for `src/**/*.ts` excl `src/cli.ts`, no thresholds.  
[Confirmed] `.github/workflows/ci.yml:1-28` — single `test` job on ubuntu/node22: typecheck, test, build, publint required; attw + coverage informational (`continue-on-error`). No `docs/`, no `compat/`, no release workflow, no `docs/adr/`.  
[Confirmed] Tests (16 files): `tests/integration/login-flow.test.ts` (loopback fake provider, real DPoP/PKCE/JWKS wire behavior locally), `tests/security/dpop-security.test.ts`, unit tests incl `oidc`, `session`, `discovery`, `dpop`, `browser-storage`, etc.  
[Confirmed] `src/core/client.ts:407-452` — `#completeLogin` loads pending, validates client/redirect, exchanges, adopts, clears pending only at `:452` on success; no `try/finally` cleanup on exchange/validation failure paths.  
[Confirmed] `src/core/session.ts:175-179,202-206,443-452` — `adopt()` catches storage save; `restore()` awaits `storage.load()` without mapping storage errors; rotated-refresh save caught.  
[Confirmed] `src/core/oidc.ts:520-535,597-616` — tolerance bypasses warn once (module globals) without config-ack flag or `session-changed` event.  
[Confirmed] `src/node/platform.ts:61-177` — loopback server binds from redirect URI, EADDRINUSE mapped, 5 min timeout.  
[Confirmed] `src/browser/storage.ts:32,120-125` — pending auth TTL 10 min; expired pending throws `SebaAuthError` on load.

## Files to create / modify (by task, scoped)
- **P0 T1:** `tests/e2e/**` (fixture server + tests), `package.json` (scripts only), `.github/workflows/e2e.yml`, `README.md` (provider table only). May add `vitest.e2e.config.ts` (test config) if needed to isolate e2e from `npm test` — in scope of test config hygiene; will not break existing `npm test`.
- **P0 T2:** `.github/workflows/release.yml`, `.github/workflows/ci.yml` (audit required step), `package.json` (`publishConfig`, pin `jose`/`idb` exact), `package-lock.json`, `CONTRIBUTING.md` (signed-commit policy + branch-protection config for PR body). No `src/**`.
- **P0 T3:** `src/core/client.ts`, `tests/unit/client-pending-cleanup.test.ts`.
- **P0 T4:** `src/core/session.ts`, `src/core/errors.ts` only if needed for stable cause metadata (minimal; prefer existing `SebaSessionExpiredError`), `tests/unit/session-restore.test.ts`.
- **P1 T5:** `vitest.config.ts`, `.github/workflows/ci.yml`, `coverage/README.md`.
- **P1 T6:** `tests/unit/session.test.ts`.
- **P1 T7:** `tests/security/redirect-no-credential-leak.test.ts`.
- **P1 T8:** `src/core/oidc.ts`, `src/core/client.ts` (wiring only if required), `tests/unit/oidc.test.ts`, `SECURITY.md`, `docs/adr/0003-tolerances-as-system.md` (+ `docs/adr/` dir).
- **P1 T9:** `.github/dependabot.yml`, `docs/dependencies.md`.
- **P1 T10–11:** scoped to docs/examples/workflows/build scripts/README as specified; `src/**` only if partial SSR entry point chosen (escalate via HUMAN_DECISIONS first).
- **P2/P3:** as specified; execute after P1 or mark BLOCKED/PARTIAL with evidence.

## Out of scope (global)
- Unrelated refactors, speculative abstractions, silent public API/security-default changes, dependency add/remove/upgrade outside task prescriptions (T2 pins prescribed), weakening/skipping existing tests, editing files outside current task scope.

## Verification commands (per task)
- T1: `npm run test:e2e` (exit 0). CI URL: BLOCKED until workflow runs in GitHub.
- T2: `node -e "const p=require('./package.json'); if(!p.publishConfig?.provenance) process.exit(1)"` + YAML syntax check + `npm audit --omit=dev --audit-level=high` (exit 0) — may BLOCK if vulnerabilities exist.
- T3: `npm test -- tests/unit/client-pending-cleanup.test.ts`
- T4: `npm test -- tests/unit/session-restore.test.ts`
- T5: `npm run test:coverage` with thresholds (may require follow-up tests; bounded to 3 iterations).
- T6: `npm test -- tests/unit/session.test.ts`
- T7: `npm test -- tests/security/redirect-no-credential-leak.test.ts`
- T8: `npm test -- tests/unit/oidc.test.ts`
- P2/P3: per task `VERIFY`.

## Risks and rollback
- **T1 e2e in default vitest include** could slow/break `npm test`; mitigate with separate config/script and/or env-gated live tests. [Inferred]
- **T2 exact pins + audit gate** may surface existing high vulns or lockfile drift; rollback by reverting commit if no fix in 3 iterations, document RCA. [Inferred]
- **T3/T4 behavior changes** are security/correctness fixes in scope; may affect callers relying on leaked errors/pending reuse — document in commit/PR; no silent public API break intended.
- **T5 thresholds** may fail on current baseline; if unreachable without weakening thresholds (forbidden), BLOCK with measured baseline.
- **T8 tolerance ack flag** changes config contract for tolerance users — requires HUMAN_DECISIONS/migration note if breaking; Task 8 states "omitting it throws SebaConfigError" (intentional safeguard) — treat as documented breaking behavior change behind explicit decision in report.

## Self-review vs Part II guardrails
- No deps added unless prescribed (T2 pins only). No test weakening. Small diffs per task. Evidence will be command output. Human decisions captured separately. Live-provider CI/branch protection/GitHub environment are external blockers → BLOCKED with exact missing access.
