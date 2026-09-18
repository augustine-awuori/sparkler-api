import { randomUUID } from "node:crypto";
import type { NextFunction, Request, Response } from "express";

import { logger } from "../../utils/logger.js";

/** Attaches a request id and a child logger, so a 500 can be traced to its log line. */
export function requestContext(req: Request, res: Response, next: NextFunction): void {
  req.requestId = req.header("x-request-id") ?? randomUUID();
  req.log = logger().child({ requestId: req.requestId });
  res.setHeader("x-request-id", req.requestId);
  next();
}
