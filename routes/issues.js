import express from "express";

import { Issue } from "../models/issue.js";
import politeAuth from "../middlewares/politeAuth.js";

const router = express.Router();

router.post('/', politeAuth, async (req, res) => {
    const { issue, sparkleId } = req.body;

    const newIssue = new Issue({
        sparkle: sparkleId,
        reporter: req.user?._id || '',
        ...issue
    });

    res.send(await newIssue.save());
});

export default router;