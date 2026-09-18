import { Router } from "express";

import { handler } from "../http/handler.js";
import { School } from "../models/school.js";

const router = Router();

router.get(
  "/",
  handler(async (_req, res) => {
    res.send(await School.find({}));
  }),
);

export default router;
