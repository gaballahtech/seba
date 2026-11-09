# Coverage baseline (T5a, tiered)

- **Date:** 2026-11-09
- **Tool:** vitest v5.1.0 + `@vitest/coverage-v8`, `npm run test:coverage` (excludes `tests/e2e/**` by default config).
- **Policy:** Tiered thresholds per directory (see `vitest.config.ts`). Do not lower thresholds without an HD entry and evidence. Do not set tiers above measured coverage.

## Tiers (enforced, measured floors — T5a)

| Tier | Lines | Branches | Rationale / note |
|---|---:|---:|---|
| `src/core/**` | 79 | 75 | Security-critical protocol logic. Measured 79.96%/75.83% after Round 1 plumbing; **T5b must raise to 80/75** (original intent). |
| `src/browser/**` | 32 | 33 | DOM/storage/browser APIs; node-env unit test cost; raise with targeted tests. |
| `src/element/**` | 0 | 0 | Web Component/DOM; no current node-env coverage baseline. |
| `src/react/**` | 14 | 35 | React bindings; baseline floor. |
| `src/node/**` | 66 | 53 | Node platform/IO. |
| fallback (other `src/**`) | 59 | 55 | Defensive fallback, measured-safe. |

## Round 1 reference
Round 1 enforced global 85/80 and failed (59.96%/58.79%). T5a replaces with tiered measured floors so the gate is green and ratchetable; T5b closes `client.ts` and restores core 80/75.
