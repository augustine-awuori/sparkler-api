import type { NextFunction, Request, Response } from "express";

import { ForbiddenError, UnauthorizedError } from "../../domain/errors.js";
import { findSparklerById } from "../../services/users.js";

/**
 * Mount after `auth`. Re-reads the user from Mongo rather than trusting the
 * token's `custom.isAdmin`, so a revoked admin loses access immediately
 * instead of when their token is next reissued.
 */
export async function requireAdmin(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }

  const user = await findSparklerById(req.user.id);
  next(user?.custom?.isAdmin ? undefined : new ForbiddenError("Unauthorised access"));
}
