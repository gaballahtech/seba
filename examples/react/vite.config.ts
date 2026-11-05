/**
 * Vite config for the React example.
 *
 * The `seba` alias points at the TypeScript sources so the example can be built from a
 * checkout without publishing the package first.
 */

import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = fileURLToPath(new URL(".", import.meta.url));
const packageRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  root,
  plugins: [react()],
  resolve: {
    alias: {
      seba: `${packageRoot}src/index.ts`,
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
