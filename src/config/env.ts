/**
 * The only place in the application that reads `process.env`.
 *
 * Everything is required by default and throws at boot. A server that starts
 * with a missing credential and then fails every request is strictly worse than
 * one that refuses to start — and a `||` literal fallback is how a Stream app
 * secret ended up committed to this repository.
 */

export function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value)
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Note that .env is only loaded when the process is started with --env-file.`,
    );

  return value;
}

export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;

  const parsed = Number(raw);
  if (!Number.isInteger(parsed))
    throw new Error(`Environment variable "${name}" must be an integer, got "${raw}".`);

  return parsed;
}
