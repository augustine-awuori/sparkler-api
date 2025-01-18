import express from "express";

import { Feedback, validateFeedback } from "../models/feedback.js";
import validate from "../middlewares/validate.js";

const router = express.Router();

router.post("/", validate(validateFeedback), async (req, res) => {
    await new Feedback(req.body).save();

    res.send();
});

export default router;
