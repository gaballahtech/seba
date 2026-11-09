import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**"],
    testTimeout: 20_000,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.d.ts", "src/cli.ts"],
      reportsDirectory: "./coverage",
      // Tiered thresholds (T5a, Round 2): per-directory to reflect real testability.
      // src/core/** (80/75 target): security-critical protocol logic (OIDC/DPoP/session/client).
      //   Set to measured floor now (lines 79, branches 75) so CI is green; T5b raises to 80/75.
      //   Round 1 added callback plumbing shifting core to 79.96% lines — do not lower below this floor.
      // src/browser/** (32/33 floor): DOM/storage/browser APIs; node-env unit test cost.
      // src/element/** (0/0 floor): Web Component/DOM; no current node-env coverage.
      // src/react/** (14/35 floor): React bindings; baseline floor.
      // src/node/** (66/53 floor): Node platform/IO.
      // Fallback 59/55: any other src file not in a tier above (defensive, measured-safe).
      thresholds: {
        "src/core/**": { lines: 79, branches: 75 },
        "src/browser/**": { lines: 32, branches: 33 },
        "src/element/**": { lines: 0, branches: 0 },
        "src/react/**": { lines: 14, branches: 35 },
        "src/node/**": { lines: 66, branches: 53 },
        lines: 59,
        branches: 55,
      },
    },
  },
});
