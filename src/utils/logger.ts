import { createRequire } from "node:module";

import pino from "pino";

/**
 * Replaces startup/logging.js, which was inert: it called `new winston.Logger()`
 * (removed in winston 3), discarded the result, and registered an
 * `unhandledRejection` handler that rethrew into a logger that was never wired
 * up — turning any stray rejection into a hard process kill.
 */
export type Logger = pino.Logger;

/**
 * pino-pretty is a devDependency, so a production install will not have it.
 * Without this check pino throws "unable to determine transport target" at boot.
 */
function hasPinoPretty(): boolean {
  try {
    createRequire(import.meta.url).resolve("pino-pretty");
    return true;
  } catch {
    return false;
  }
}

let root: Logger | undefined;

export function initLogger(level: string, pretty: boolean): Logger {
  root = pino({
    level,
    redact: {
      // Never let a credential reach the log stream.
      paths: [
        "req.headers['x-auth-token']",
        "req.headers.authorization",
        "*.authCode",
        "*.feedToken",
        "*.chatToken",
        "*.password",
      ],
      censor: "[redacted]",
    },
    ...(pretty && hasPinoPretty() ? { transport: { target: "pino-pretty" } } : {}),
  });

  return root;
}

export function logger(): Logger {
  root ??= pino({ level: process.env.LOG_LEVEL ?? "info" });
  return root;
}
