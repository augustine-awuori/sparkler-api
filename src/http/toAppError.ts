import mongoose from "mongoose";
import { ZodError } from "zod";
import jwt from "jsonwebtoken";

import {
  AppError,
  BadRequestError,
  ConflictError,
  InternalError,
  UnauthorizedError,
  ValidationError,
  isAppError,
} from "../domain/errors.js";

// jsonwebtoken is CommonJS: named ESM imports typecheck but fail at runtime
// under plain Node ("does not provide an export named ..."). Destructure the
// default export instead.
const { JsonWebTokenError, TokenExpiredError } = jwt;

interface MongoServerErrorish {
  code?: number;
  keyPattern?: Record<string, unknown>;
}

interface BodyParserErrorish {
  type?: string;
  status?: number;
}

/**
 * Total function: turns anything thrown anywhere into an AppError.
 *
 * This is where a lot of today's wrong status codes get corrected — a CastError
 * on a malformed id is a 400, not a 500, and a duplicate key is a 409.
 */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;

  if (e instanceof ZodError)
    return new ValidationError(
      e.issues[0]?.message ?? "Validation failed",
      e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );

  if (e instanceof mongoose.Error.ValidationError)
    return new ValidationError(
      Object.values(e.errors)[0]?.message ?? "Validation failed",
      Object.entries(e.errors).map(([path, err]) => ({ path, message: err.message })),
    );

  if (e instanceof mongoose.Error.CastError)
    return new BadRequestError(`Invalid value for "${e.path}"`);

  if (e instanceof TokenExpiredError) return new UnauthorizedError("Token expired. Login again.");
  if (e instanceof JsonWebTokenError) return new UnauthorizedError("Invalid token.");

  if (e instanceof Error) {
    const mongoErr = e as Error & MongoServerErrorish;
    if (mongoErr.code === 11000) {
      const field = Object.keys(mongoErr.keyPattern ?? {})[0];
      return new ConflictError(field ? `${field} already exists` : "Already exists");
    }

    const bodyErr = e as Error & BodyParserErrorish;
    if (bodyErr.type === "entity.too.large")
      return new AppError({ status: 413, code: "payload_too_large", message: "Payload too large" });
    if (e instanceof SyntaxError && typeof bodyErr.status === "number")
      return new BadRequestError("Malformed JSON body");

    return new InternalError(e.message, e);
  }

  return new InternalError("Something failed", e);
}
