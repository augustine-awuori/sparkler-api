import cors from "cors";
import express from "express";
import serveStatic from "serve-static";

import auth from "../routes/auth.js";
import bugs from "../routes/bugs.js";
import chatToken from "../routes/chatToken.js";
import communities from "../routes/communities.js";
import data from "../routes/data.js";
import error from "../middlewares/error.js";
import expoPushNotifications from "../routes/expoPushNotifications.js";
import expoPushTokens from "../routes/expoPushTokens.js";
import feedback from "../routes/feedback.js";
import hashtags from "../routes/hashtags.js";
import mails from "../routes/mails.js";
import projects from "../routes/projects.js";
import reports from "../routes/reports.js";
import reactions from "../routes/reactions.js";
import sparkleFromPDF from "../routes/sparkleFromPDF.js";
import sparkles from "../routes/sparkles.js";
import users from "../routes/users.js";

export default function (app) {
  app.use(express.json());
  app.use(serveStatic("public", { acceptRanges: false }));
  app.use(cors({ origin: "*" }));
  app.use("/api/auth", auth);
  app.use("/api/bugs", bugs);
  app.use("/api/chatToken", chatToken);
  app.use("/api/communities", communities);
  app.use("/api/data", data);
  app.use("/api/expoPushNotifications", expoPushNotifications);
  app.use("/api/expoPushTokens", expoPushTokens);
  app.use("/api/feedback", feedback);
  app.use("/api/users", users);
  app.use("/api/hashtags", hashtags);
  app.use("/api/mails", mails);
  app.use("/api/projects", projects);
  app.use("/api/reactions", reactions);
  app.use("/api/reports", reports);
  app.use("/api/sparkles", sparkles);
  app.use("/api/sparkleFromPDF", sparkleFromPDF);
  app.use(error);
}
