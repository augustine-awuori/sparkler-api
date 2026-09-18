import { Router } from "express";

import { handler } from "../http/handler.js";
import { Programme } from "../models/programme.js";

interface ProgrammeBody {
  name?: string;
  school?: string;
}

const router = Router();

router.post(
  "/",
  handler<Record<string, string>, ProgrammeBody>(async (req, res) => {
    const { name, school } = req.body;

    if (!name || !school)
      return res.status(400).send({ error: "Name and school are required." });

    res.send(await new Programme({ name, school }).save());
  }),
);

router.get(
  "/",
  handler(async (_req, res) => {
    res.send(await Programme.find({}));
  }),
);

export default router;
