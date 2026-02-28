import cors from "cors";
import express from "express";
import serveStatic from "serve-static";

import alumnis from "../routes/alumnis.js";
import bugs from "../routes/bugs.js";
import chatToken from "../routes/chatToken.js";
import communities from "../routes/communities.js";
import programmes from "../routes/programmes.js";
import departments from "../routes/departments.js";
import error from "../middlewares/error.js";
import feedback from "../routes/feedback.js";
import grao from "../routes/grao.js";
import issues from "../routes/issues.js";
import mails from "../routes/mails.js";
import pushTokens from "../routes/pushTokens.js";
import reports from "../routes/reports.js";
import sparklers from "../routes/sparklers.js";
import verifications from "../routes/verifications.js";

export default function (app) {
  app.use(express.json());
  app.use(serveStatic("public", { acceptRanges: false }));
  app.use(cors({ origin: "*" }));
  app.use("/api/alumnis", alumnis);
  app.use("/api/bugs", bugs);
  app.use("/api/programmes", programmes);
  app.use("/api/chatToken", chatToken);
  app.use("/api/communities", communities);
  app.use("/api/departments", departments);
  app.use("/api/feedback", feedback);
  app.use("/api/grao", grao);
  app.use("/api/issues", issues);
  app.use("/api/mails", mails);
  app.use("/api/pushTokens", pushTokens);
  app.use("/api/reports", reports);
  app.use("/api/sparklers", sparklers);
  app.use("/api/verifications", verifications);
  app.use(error);
}
