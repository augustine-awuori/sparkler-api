import { intEnv, optionalEnv, requireEnv } from "./env.js";

export interface AppConfig {
  readonly env: "development" | "production" | "test";
  readonly port: number;
  readonly databaseUrl: string;
  readonly jwtSecret: string;
  readonly logLevel: string;
  readonly stream: {
    /** Feeds v3 credentials. Clients' chat uses the same Stream app. */
    readonly apiKey: string;
    readonly apiSecret: string;
  };
  readonly resendApiKey: string;
}

let cached: AppConfig | undefined;

/**
 * Reads and validates the environment. Call once, from the entrypoint — never
 * at module top level, or importing anything transitively would demand a full
 * environment (which is what made the old route modules untestable).
 */
export function loadConfig(): AppConfig {
  const env = optionalEnv("NODE_ENV", "development");

  cached = {
    env: env === "production" || env === "test" ? env : "development",
    port: intEnv("PORT", 3000),
    databaseUrl: requireEnv("db"),
    jwtSecret: requireEnv("jwtPrivateKey"),
    logLevel: optionalEnv("LOG_LEVEL", env === "production" ? "info" : "debug"),
    stream: {
      apiKey: requireEnv("NEW_FEED_API_KEY"),
      apiSecret: requireEnv("NEW_CHAT_API_SECRET"),
    },
    resendApiKey: requireEnv("RESEND_API_KEY"),
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
