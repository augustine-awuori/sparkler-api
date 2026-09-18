import { Router } from "express";

import { handler } from "../http/handler.js";
import { validate } from "../http/middlewares/validate.js";
import { Feedback, validateFeedback } from "../models/feedback.js";

const router = Router();

router.post(
  "/",
  validate(validateFeedback),
  handler(async (req, res) => {
    await new Feedback(req.body).save();

    res.send();
  }),
);

export default router;
