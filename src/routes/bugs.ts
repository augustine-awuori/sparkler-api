import { Router } from "express";

import { handler } from "../http/handler.js";
import { validate } from "../http/middlewares/validate.js";
import { Bug, validateBug } from "../models/bug.js";

const router = Router();

router.post(
  "/",
  validate(validateBug),
  handler(async (req, res) => {
    res.send(await new Bug(req.body).save());
  }),
);

router.get(
  "/",
  handler(async (_req, res) => {
    res.send(await Bug.find({}).sort("solved"));
  }),
);

router.patch(
  "/solve/:errorId",
  handler<{ errorId: string }>(async (req, res) => {
    // Previously findByIdAndUpdate({ resolved: true }, { new: true }): the update
    // was passed as the id and the field name was wrong, so this never worked.
    const bug = await Bug.findByIdAndUpdate(
      req.params.errorId,
      { solved: true },
      { returnDocument: "after" },
    );

    if (!bug)
      return res.status(404).send({ error: "The bug does not exist in the database" });

    res.send(bug);
  }),
);

export default router;
