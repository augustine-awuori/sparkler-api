/**
 * The application error hierarchy. Framework-free: nothing here imports express
 * or mongoose, so services and repositories can throw without depending on HTTP.
 */

export type ErrorCode =
  | "bad_request"
  | "validation_failed"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "payload_too_large"
  | "rate_limited"
  | "upstream_failure"
  | "internal_error";

export interface AppErrorInit {
  status: number;
  code: ErrorCode;
  message: string;
  /** May `message` be shown to the caller? False for anything with internals in it. */
  expose?: boolean;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly expose: boolean;
  readonly details?: unknown;

  constructor({ status, code, message, expose = status < 500, details, cause }: AppErrorInit) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = new.target.name;
    this.status = status;
    this.code = code;
    this.expose = expose;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request", details?: unknown) {
    super({ status: 400, code: "bad_request", message, details });
  }
}

export class ValidationError extends AppError {
  constructor(message = "Validation failed", details?: unknown) {
    super({ status: 400, code: "validation_failed", message, details });
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Access denied. Login to get access.") {
    super({ status: 401, code: "unauthorized", message });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Unauthorised access") {
    super({ status: 403, code: "forbidden", message });
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super({ status: 404, code: "not_found", message });
  }
}

export class ConflictError extends AppError {
  constructor(message = "Already exists", details?: unknown) {
    super({ status: 409, code: "conflict", message, details });
  }
}

export class TooManyRequestsError extends AppError {
  constructor(message = "Too many requests") {
    super({ status: 429, code: "rate_limited", message });
  }
}

/** A third party (Stream, Resend, Poe) failed. Never exposes their message. */
export class UpstreamError extends AppError {
  constructor(message = "Upstream service unavailable", cause?: unknown) {
    super({ status: 502, code: "upstream_failure", message, expose: false, cause });
  }
}

export class InternalError extends AppError {
  constructor(message = "Something failed", cause?: unknown) {
    super({ status: 500, code: "internal_error", message, expose: false, cause });
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** What a caller sees when an error is not safe to expose. */
export const DEFAULT_MESSAGE: Record<ErrorCode, string> = {
  bad_request: "Bad request",
  validation_failed: "Validation failed",
  unauthorized: "Access denied. Login to get access.",
  forbidden: "Unauthorised access",
  not_found: "Not found",
  conflict: "Already exists",
  payload_too_large: "Payload too large",
  rate_limited: "Too many requests",
  upstream_failure: "Upstream service unavailable",
  internal_error: "Something failed",
};
