import cors from "cors";
import express from "express";
import serveStatic from "serve-static";

import error from "../middlewares/error.js";
import users from "../routes/users.js";

export default function (app) {
  app.use(express.json());
  app.use(serveStatic("public", { acceptRanges: false }));
  app.use(cors({ origin: "*" }));
  app.use("/api/users", users);
  app.use(error);
}
