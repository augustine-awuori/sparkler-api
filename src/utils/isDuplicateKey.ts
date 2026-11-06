/** Mongo's answer when a unique index refuses a write. */
export const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === 11000;
