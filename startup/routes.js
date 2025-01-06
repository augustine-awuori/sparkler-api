import cors from "cors";
import express from "express";
import serveStatic from "serve-static";

import auth from "../routes/auth.js";
import chatToken from "../routes/chatToken.js";
import data from "../routes/data.js";
import expoPushNotifications from "../routes/expoPushNotifications.js";
import expoPushTokens from "../routes/expoPushTokens.js";
import error from "../middlewares/error.js";
import hashtags from "../routes/hashtags.js";
import reactions from "../routes/reactions.js";
import sparkles from "../routes/sparkles.js";
import users from "../routes/users.js";

export default function (app) {
  app.use(express.json());
  app.use(serveStatic("public", { acceptRanges: false }));
  app.use(cors({ origin: "*" }));
  app.use("/api/auth", auth);
  app.use("/api/chatToken", chatToken);
  app.use("/api/data", data);
  app.use("/api/expoPushNotifications", expoPushNotifications);
  app.use("/api/expoPushTokens", expoPushTokens);
  app.use("/api/users", users);
  app.use("/api/hashtags", hashtags);
  app.use("/api/reactions", reactions);
  app.use("/api/sparkles", sparkles);
  app.use(error);
}
