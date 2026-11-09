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
      thresholds: {
        lines: 85,
        branches: 80,
        "src/core/dpop.ts": { branches: 90 },
        "src/core/oidc.ts": { branches: 90 },
        "src/core/session.ts": { branches: 90 },
        "src/core/client.ts": { branches: 90 },
      },
    },
  },
});
