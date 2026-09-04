// Fail at boot rather than silently constructing a client with `undefined`
// credentials, or falling back to a literal committed in source.
export default function requireEnv(name) {
  const value = process.env[name];

  if (!value)
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Note that .env is only loaded when the process is started with --env-file.`,
    );

  return value;
}
