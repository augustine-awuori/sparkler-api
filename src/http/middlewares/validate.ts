import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { ValidationResult } from "joi";

import { ValidationError } from "../../domain/errors.js";

/**
 * Validates `req.body` with one of the Joi validators exported from models/.
 * The 400's `error` string is Joi's first message, exactly as before.
 */
export function validate(validator: (body: unknown) => ValidationResult): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const { error } = validator(req.body);

    next(
      error
        ? new ValidationError(
            error.details[0]?.message,
            error.details.map((d) => ({ path: d.path.join("."), message: d.message })),
          )
        : undefined,
    );
  };
}
