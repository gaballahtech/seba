# Coverage baseline (T5b, tiered)

- **Date:** 2026-11-09 (Round 3 Stage 1)
- **Tool:** vitest v5.1.0 + `@vitest/coverage-v8`, `npm run test:coverage` (excludes `tests/e2e/**` by default config).
- **Policy:** Tiered thresholds per directory (see `vitest.config.ts`). Do not lower thresholds without an HD entry and evidence. Do not set tiers above measured coverage.

## Tiers (enforced)

| Tier | Lines | Branches | Rationale / note |
|---|---:|---:|---|
| `src/core/**` | 85 | 80 | **Stable/production gate (T5b complete).** Security-critical protocol logic (OIDC/DPoP/session/client). Measured 85.03%/82.07% on 2026-11-09 after targeted client flow/config/helper tests (`tests/unit/client-edge-cases.test.ts`, `tests/unit/core-coverage-boost.test.ts`). `src/core/client.ts` measured 85.77%/83.06% (branches ≥75% target met). |
| `src/browser/**` | 32 | 33 | DOM/storage/browser APIs; node-env unit test cost; raise with targeted tests. |
| `src/element/**` | 0 | 0 | Web Component/DOM; no current node-env coverage baseline (BETA). |
| `src/react/**` | 14 | 35 | React bindings; baseline floor (BETA). |
| `src/node/**` | 66 | 53 | Node platform/IO (BETA). |
| fallback (other `src/**`) | 59 | 55 | Defensive fallback, measured-safe. |

## History
- **T5a (Round 2):** Replaced failing global 85/80 with tiered measured floors; core set to 79/75 pending T5b.
- **T5b (Round 3 Stage 1):** Added 18 targeted tests (10 edge/config/callback/start guards + 8 helper/emitter/debug/storage branches); raised `src/core/**` to 85/80. No `v8` ignore comments; no behavior changes to `src/core/client.ts`.
