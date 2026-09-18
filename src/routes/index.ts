import type { Application } from "express";

import mails from "./mails.js";
import pushTokens from "./pushTokens.js";
import schools from "./schools.js";
import sparklers from "./sparklers.js";

/**
 * Mounting only — app wiring lives in app.ts. This is exactly the surface the
 * mobile and web clients use, plus the admin-only mails and sparkler ops routes.
 */
export function mountRoutes(app: Application): void {
  app.use("/api/mails", mails);
  app.use("/api/pushTokens", pushTokens);
  app.use("/api/schools", schools);
  app.use("/api/sparklers", sparklers);
}
