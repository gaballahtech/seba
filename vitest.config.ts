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
      // Tiered thresholds (T5a/T5b, Round 2/3): per-directory to reflect real testability.
      // src/core/** (stable/production gate): security-critical protocol logic (OIDC/DPoP/session/client).
      //   Raised to 85/80 (T5b, 2026-11-09): measured 85.03%/82.07% after targeted flow/config/helper tests.
      // src/browser/** (32/33 floor): DOM/storage/browser APIs; node-env unit test cost.
      // src/element/** (0/0 floor): Web Component/DOM; no current node-env coverage (BETA).
      // src/react/** (14/35 floor): React bindings; baseline floor (BETA).
      // src/node/** (66/53 floor): Node platform/IO (BETA).
      // Fallback 59/55: any other src file not in a tier above (defensive, measured-safe).
      thresholds: {
        "src/core/**": { lines: 85, branches: 80 },
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
