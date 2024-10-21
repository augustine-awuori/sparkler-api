import cors from "cors";
import express from "express";
import serveStatic from "serve-static";

import auth from "../routes/auth.js";
import categories from "../routes/categories.js";
import chatToken from "../routes/chatToken.js";
import courses from "../routes/courses.js";
import data from "../routes/data.js";
import error from "../middlewares/error.js";
import people from "../routes/people.js";
import users from "../routes/users.js";

export default function (app) {
  app.use(express.json());
  app.use(serveStatic("public", { acceptRanges: false }));
  app.use(cors({ origin: "*" }));
  app.use("/api/auth", auth);
  app.use("/api/categories", categories);
  app.use("/api/courses", courses);
  app.use("/api/chatToken", chatToken);
  app.use("/api/data", data);
  app.use("/api/people", people);
  app.use("/api/users", users);
  app.use(error);
}
