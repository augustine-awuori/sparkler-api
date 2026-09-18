import type { Server } from "node:http";

import { createApp } from "./app.js";
import { connectDb, disconnectDb } from "./config/db.js";
import { loadConfig } from "./config/index.js";
import { initLogger, logger } from "./utils/logger.js";

async function main(): Promise<Server> {
  const config = loadConfig();
  initLogger(config.logLevel, config.env === "development");

  // Fail fast. startup/db.js logged and continued, so the server booted with no
  // database and every request buffered until it timed out — while a health
  // check still reported the service as up.
  await connectDb(config.databaseUrl);

  return createApp().listen(config.port, () =>
    logger().info(`Server is listening on port ${config.port}`),
  );
}

const server = await main().catch((err: unknown) => {
  // Config and connection failures happen before the logger is useful, and a
  // raw stack trace is the wrong thing to greet an operator with.
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Failed to start: ${message}`);
  process.exit(1);
});

function fatal(reason: string) {
  return (err: unknown): void => {
    logger().fatal({ err }, reason);
    server.close(() => {
      void disconnectDb().finally(() => process.exit(1));
    });
    setTimeout(() => process.exit(1), 5_000).unref();
  };
}

process.on("uncaughtException", fatal("Uncaught exception"));
process.on("unhandledRejection", fatal("Unhandled rejection"));

for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    logger().info(`${signal} received, shutting down`);
    server.close(() => {
      void disconnectDb().finally(() => process.exit(0));
    });
  });

export default server;
