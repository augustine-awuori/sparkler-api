import type { Request, Response, NextFunction } from "express";

import { NotFoundError } from "../../domain/errors.js";

/** Register after all routes, before errorHandler. */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError(`Cannot ${req.method} ${req.originalUrl}`));
}
