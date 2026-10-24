import { afterEach, describe, expect, it } from "vitest";

import { __resetConfig, loadConfig } from "../../src/config/index.js";

const originalEnv = process.env.NODE_ENV;
const originalDatabaseUrl = process.env.db;

afterEach(() => {
  if (originalEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalEnv;

  if (originalDatabaseUrl === undefined) delete process.env.db;
  else process.env.db = originalDatabaseUrl;

  __resetConfig();
});

describe("loadConfig database URL", () => {
  it("uses local MongoDB in development, regardless of db", () => {
    process.env.NODE_ENV = "development";
    process.env.db = "mongodb://remote.example/sparkler";

    expect(loadConfig().databaseUrl).toBe("mongodb://127.0.0.1:27017/sparkler-api");
  });

  it("uses the configured db URL outside development", () => {
    process.env.NODE_ENV = "production";
    process.env.db = "mongodb://production.example/sparkler";

    expect(loadConfig().databaseUrl).toBe("mongodb://production.example/sparkler");
  });
});
