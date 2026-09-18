import type { Application } from "express";

import alumnis from "./alumnis.js";
import bugs from "./bugs.js";
import chatToken from "./chatToken.js";
import communities from "./communities.js";
import departments from "./departments.js";
import feedback from "./feedback.js";
import grao from "./grao.js";
import issues from "./issues.js";
import mails from "./mails.js";
import programmes from "./programmes.js";
import pushTokens from "./pushTokens.js";
import reports from "./reports.js";
import schools from "./schools.js";
import sparklers from "./sparklers.js";
import verifications from "./verifications.js";

/** Replaces startup/routes.js. Mounting only — app wiring lives in app.ts. */
export function mountRoutes(app: Application): void {
  app.use("/api/alumnis", alumnis);
  app.use("/api/bugs", bugs);
  app.use("/api/chatToken", chatToken);
  app.use("/api/communities", communities);
  app.use("/api/departments", departments);
  app.use("/api/feedback", feedback);
  app.use("/api/grao", grao);
  app.use("/api/issues", issues);
  app.use("/api/mails", mails);
  app.use("/api/programmes", programmes);
  app.use("/api/pushTokens", pushTokens);
  app.use("/api/reports", reports);
  app.use("/api/schools", schools);
  app.use("/api/sparklers", sparklers);
  app.use("/api/verifications", verifications);
}
