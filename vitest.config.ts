import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["tests/setup/mongo.ts"],
    setupFiles: ["tests/setup/env.ts"],
    include: ["tests/**/*.test.ts"],

    // One shared in-memory MongoDB for the whole run, so test files must not
    // run concurrently against it.
    pool: "forks",
    fileParallelism: false,

    testTimeout: 30_000,
    // The first run downloads a ~780MB mongod binary.
    hookTimeout: 120_000,
  },
});
