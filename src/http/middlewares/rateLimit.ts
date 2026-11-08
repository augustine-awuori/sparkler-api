import type { NextFunction, Request, Response } from "express";

import { TooManyRequestsError } from "../../domain/errors.js";

interface Bucket {
  tokens: number;
  refilledAt: number;
}

export interface RateLimitOptions {
  /** How many units one caller may spend at once. */
  capacity: number;
  /** Units given back per minute. */
  perMinute: number;
  /** How many units a request costs, such as the number of events in a batch. */
  cost?: (req: Request) => number;
  now?: () => number;
}

/**
 * Behind Railway's proxy every request comes from the proxy, so the first
 * forwarded address stands in for the caller. It can be spoofed, which only
 * lets a caller pick their own bucket; this limit is about floods, not identity.
 */
function callerOf(req: Request): string {
  const forwarded = req.header("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.ip || "unknown";
}

const MAX_TRACKED_CALLERS = 10_000;

/**
 * An in-memory token bucket. Per server instance, which is enough to stop one
 * crashing client in a loop from filling the database; no dependency or store.
 */
export function rateLimit({ capacity, perMinute, cost = () => 1, now = Date.now }: RateLimitOptions) {
  const buckets = new Map<string, Bucket>();

  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = callerOf(req);
    const at = now();
    const bucket = buckets.get(key) ?? { tokens: capacity, refilledAt: at };
    bucket.tokens = Math.min(capacity, bucket.tokens + ((at - bucket.refilledAt) / 60_000) * perMinute);
    bucket.refilledAt = at;

    const price = Math.max(1, cost(req));
    if (bucket.tokens < price) {
      next(new TooManyRequestsError("Too many error reports. Try again shortly."));
      return;
    }
    bucket.tokens -= price;

    if (!buckets.has(key) && buckets.size >= MAX_TRACKED_CALLERS) buckets.clear();
    buckets.set(key, bucket);
    next();
  };
}
