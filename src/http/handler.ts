import type { NextFunction, Request, RequestHandler, Response } from "express";

import type { AuthUser } from "../domain/user.types.js";
import { UnauthorizedError } from "../domain/errors.js";

/**
 * Handler wrappers.
 *
 * NOTE: these exist for TYPING and auth narrowing, not error propagation.
 * Express 5 already forwards a rejected handler promise into the error chain,
 * so the 18 hand-written try/catch blocks in the old code were redundant once
 * the error middleware had the right arity. Crediting a wrapper with that fix
 * would misattribute it.
 *
 * The real reason to wrap: @types/express@5 types RequestHandler as returning
 * `void | Promise<void>`, so `return res.json(x)` — which returns Response —
 * is a type error without a wrapper that accepts `unknown`.
 */

export type AuthedRequest<
  P = Record<string, string>,
  B = unknown,
  Q = Record<string, unknown>,
> = Request<P, unknown, B, Q> & { user: AuthUser };

export function handler<P = Record<string, string>, B = unknown, Q = Record<string, unknown>>(
  fn: (req: Request<P, unknown, B, Q>, res: Response, next: NextFunction) => unknown,
): RequestHandler<P, unknown, B, Q> {
  return (req, res, next) => {
    void Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Narrows `req.user` to non-optional for routes mounted behind `authenticate`.
 *
 * Asserts at runtime rather than casting, so a route wired without the auth
 * middleware fails loudly instead of reading `undefined.id` — which is the
 * shape of bug that made routes/chatToken.js 500 on every call.
 */
export function authedHandler<P = Record<string, string>, B = unknown, Q = Record<string, unknown>>(
  fn: (req: AuthedRequest<P, B, Q>, res: Response, next: NextFunction) => unknown,
): RequestHandler<P, unknown, B, Q> {
  return (req, res, next) => {
    if (!req.user) {
      next(new UnauthorizedError());
      return;
    }
    void Promise.resolve(fn(req as AuthedRequest<P, B, Q>, res, next)).catch(next);
  };
}
