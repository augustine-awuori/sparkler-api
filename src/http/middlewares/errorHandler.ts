import type { NextFunction, Request, Response } from "express";

import { errorBody } from "../respond.js";
import { toAppError } from "../toAppError.js";

/**
 * The application error handler.
 *
 * ARITY MUST BE EXACTLY 4. Express identifies error handlers by `fn.length === 4`.
 * The previous implementation declared three parameters, so Express registered it
 * as ordinary middleware: errors skipped it entirely (falling through to
 * Express's HTML default), and unmatched routes were passed into it as normal
 * middleware where it returned without calling next() — silently hanging the
 * request forever.
 *
 * Register LAST, after all routes and after notFoundHandler.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const e = toAppError(err);

  const log = req.log ?? console;
  const context = {
    method: req.method,
    path: req.originalUrl,
    status: e.status,
    code: e.code,
    userId: req.user?.id,
  };

  if (e.status >= 500) log.error({ ...context, err: e }, e.message);
  else log.warn(context, e.message);

  // Once bytes are on the wire the only correct action is to let Express's
  // default handler destroy the socket.
  if (res.headersSent) {
    next(err);
    return;
  }

  res.status(e.status).json(errorBody(e, req.requestId));
}
