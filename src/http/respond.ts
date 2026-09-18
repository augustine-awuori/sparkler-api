import type { Response } from "express";

import { DEFAULT_MESSAGE, type AppError } from "../domain/errors.js";

/**
 * Response writers.
 *
 * The migration deliberately keeps SUCCESS bytes identical to the pre-refactor
 * API. Several clients read a raw JWT out of the response body, so wrapping
 * responses in a `{ data }` envelope would add JSON quotes and silently break
 * authentication. A versioned envelope belongs behind a future /api/v2, not in
 * the change that moves every file.
 */

export function ok<T>(res: Response, body: T): void {
  res.status(200).json(body);
}

export function created<T>(res: Response, body: T): void {
  res.status(201).json(body);
}

export function noContent(res: Response): void {
  res.status(204).end();
}

/**
 * A bare, unquoted string body — `text/html`, matching `res.send(string)`.
 *
 * Used only by the sign-in endpoints and /api/grao, whose clients consume the
 * body directly. Do not use it for anything new.
 */
export function legacyText(res: Response, text: string): void {
  res.status(200).send(text);
}

export function withAuthToken(res: Response, token: string): Response {
  return res.header("x-auth-token", token);
}

export interface ApiErrorBody {
  error: string;
  code: string;
  requestId: string;
  details?: unknown;
}

/**
 * `error` stays a top-level string, exactly as before — every existing client
 * reads `body.error`. `code`, `requestId` and `details` are purely additive.
 */
export function errorBody(e: AppError, requestId: string): ApiErrorBody {
  return {
    error: e.expose ? e.message : DEFAULT_MESSAGE[e.code],
    code: e.code,
    requestId,
    ...(e.details === undefined ? {} : { details: e.details }),
  };
}
