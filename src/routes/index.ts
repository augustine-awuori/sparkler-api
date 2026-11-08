import type { Application } from "express";

import communities from "./communities.js";
import errors from "./errors.js";
import events from "./events.js";
import issues from "./issues.js";
import moderation from "./moderation.js";
import mails from "./mails.js";
import places from "./places.js";
import points from "./points.js";
import pushTokens from "./pushTokens.js";
import schools from "./schools.js";
import sparklers from "./sparklers.js";
import studentVerification from "./studentVerification.js";

/**
 * Mounting only — app wiring lives in app.ts. This is exactly the surface the
 * mobile and web clients use, plus the admin-only mails and sparkler ops routes.
 */
export function mountRoutes(app: Application): void {
  app.use("/api/communities", communities);
  app.use("/api/errors", errors);
  app.use("/api/events", events);
  app.use("/api/issues", issues);
  app.use("/api/mails", mails);
  app.use("/api/moderation", moderation);
  app.use("/api/places", places);
  app.use("/api/points", points);
  app.use("/api/pushTokens", pushTokens);
  app.use("/api/schools", schools);
  app.use("/api/sparklers", sparklers);
  app.use("/api/studentVerification", studentVerification);
}
