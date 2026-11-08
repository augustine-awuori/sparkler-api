import { intEnv, optionalEnv, requireEnv } from "./env.js";

export interface AppConfig {
  readonly env: "development" | "production" | "test";
  readonly port: number;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly firebaseApiKey: string;
  readonly logLevel: string;
  readonly stream: {
    /** Feeds v3 credentials. Clients' chat uses the same Stream app. */
    readonly apiKey: string;
    readonly apiSecret: string;
  };
  readonly resendApiKey: string;
  /** Where error-tracker emails link to. No trailing slash. */
  readonly errorsDashboardUrl: string;
}

/** Optional, so adding the error tracker can't stop a server that lacks the variable from booting. */
const DEFAULT_ERRORS_DASHBOARD_URL = "https://sparkler-errors.netlify.app";

let cached: AppConfig | undefined;

/**
 * Reads and validates the environment. Call once, from the entrypoint — never
 * at module top level, or importing anything transitively would demand a full
 * environment (which is what made the old route modules untestable).
 */
export function loadConfig(): AppConfig {
  const env = optionalEnv("NODE_ENV", "development");
  const appEnv = env === "production" || env === "test" ? env : "development";

  cached = {
    env: appEnv,
    port: intEnv("PORT", 3000),
    databaseUrl:
      appEnv === "development" ? "mongodb://127.0.0.1:27017/sparkler-api" : requireEnv("db"),
    jwtSecret: requireEnv("jwtPrivateKey"),
    firebaseApiKey: requireEnv("FIREBASE_API_KEY"),
    logLevel: optionalEnv("LOG_LEVEL", env === "production" ? "info" : "debug"),
    stream: {
      apiKey: requireEnv("NEW_FEED_API_KEY"),
      apiSecret: requireEnv("NEW_CHAT_API_SECRET"),
    },
    resendApiKey: requireEnv("RESEND_API_KEY"),
    // `||`, so the empty line .env.example leaves still falls back.
    errorsDashboardUrl: (optionalEnv("ERRORS_DASHBOARD_URL", "") || DEFAULT_ERRORS_DASHBOARD_URL).replace(/\/+$/, ""),
  };

  return cached;
}

/** The loaded config. Throws if the entrypoint has not called loadConfig yet. */
export function config(): AppConfig {
  if (!cached) throw new Error("Config not loaded — call loadConfig() from the entrypoint first.");
  return cached;
}

/** Test seam. */
export function __resetConfig(): void {
  cached = undefined;
}
