import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // Integration suites share one scratch Postgres database and each
    // resets it in beforeAll — running files in parallel corrupts state.
    fileParallelism: false,
    setupFiles: ["./lib/test/setup-fake-indexeddb.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
