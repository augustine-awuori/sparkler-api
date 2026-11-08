import type { NextFunction, Request, Response } from "express";

import { ForbiddenError, UnauthorizedError } from "../../domain/errors.js";
import { staffFor } from "../../services/developers.js";

/**
 * Who may work on issues and on the error tracker: Sparkler admins and active
 * developers on the errors team. Mount after `auth`. Read from Mongo every
 * time, so removing someone takes effect on their next request.
 */
export async function requireIssueStaff(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) {
    next(new UnauthorizedError());
    return;
  }
  const staff = await staffFor(req.user.id);
  if (!staff) {
    next(new ForbiddenError("Unauthorised access"));
    return;
  }
  req.staff = staff;
  next();
}

/** After `requireIssueStaff`: only the team's admins. */
export function requireStaffAdmin(req: Request, _res: Response, next: NextFunction): void {
  next(req.staff?.role === "admin" ? undefined : new ForbiddenError("Only a team admin can do that"));
}
