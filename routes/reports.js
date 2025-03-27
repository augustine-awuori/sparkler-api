import express from "express";

import { Report, validateReport } from "../models/report.js";
import auth from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";

const router = express.Router();

router.post('/', validate(validateReport), async (req, res) => {
    const report = new Report(req.body);

    await report.save();

    res.send(report);
});

router.get('/', [auth], async (req, res) => {
    const reports = await Report.find({});

    res.send(reports);
});

export default router;