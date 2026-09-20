import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    hookTimeout: 30_000,
    testTimeout: 30_000,
    // Integration suites share one scratch Postgres database (TEST_DATABASE_URL)
    // and each resets it in beforeAll — running files in parallel corrupts
    // each other's state.
    fileParallelism: false,
  },
});
