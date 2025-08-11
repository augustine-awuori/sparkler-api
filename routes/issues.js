import express from "express";

import { Issue } from "../models/issue.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post('/', auth, async (req, res) => {
    const { issue, sparkleId } = req.body;

    const newIssue = new Issue({
        sparkle: sparkleId,
        ...issue
    });

    res.send(await newIssue.save());
});

export default router;