import type { NextFunction, Request, RequestHandler, Response } from "express";
import jwt from "jsonwebtoken";

import { UnauthorizedError } from "../../domain/errors.js";
import { config } from "../../config/index.js";
import type { AuthTokenClaims, AuthUser } from "../../domain/user.types.js";

/**
 * Structural guard over the JWT payload.
 *
 * jwt.verify returns `string | JwtPayload`, so strict mode forces this — and it
 * is not ceremony: validating that `id` is present at the boundary permanently
 * kills the `req.user._id` bug class, which made routes/chatToken.js throw on
 * every call and left routes/issues.js writing an empty `reporter`.
 */
function parseClaims(raw: unknown): AuthUser {
  if (typeof raw !== "object" || raw === null)
    throw new UnauthorizedError("Invalid token. User doesn't exist");

  const claims = raw as Partial<AuthTokenClaims>;
  if (typeof claims.id !== "string" || claims.id.length === 0)
    throw new UnauthorizedError("Invalid token. User doesn't exist");

  return {
    id: claims.id,
    ...(claims.name === undefined ? {} : { name: claims.name }),
    ...(claims.image === undefined ? {} : { image: claims.image }),
    custom: claims.custom ?? {},
  };
}

export function verifyAuthToken(token: string): AuthUser {
  try {
    return parseClaims(jwt.verify(token, config().jwtSecret));
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    throw new UnauthorizedError("Invalid token. User doesn't exist");
  }
}

/**
 * One factory replacing the near-identical auth.js and politeAuth.js.
 *
 * `required: false` reproduces politeAuth: a MISSING token passes through, but
 * a malformed one is still rejected — it was only ever polite about absence.
 */
export function authenticate({ required }: { required: boolean }): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const token = req.header("x-auth-token");

    if (!token) {
      next(required ? new UnauthorizedError() : undefined);
      return;
    }

    try {
      req.user = verifyAuthToken(token);
      next();
    } catch (e) {
      next(e);
    }
  };
}

export const auth = authenticate({ required: true });
export const politeAuth = authenticate({ required: false });
