import express from "express";

import { Bug, validateBug } from "../models/bug.js";
import validate from "../middlewares/validate.js";

const router = express.Router();

router.post("/", validate(validateBug), async (req, res) => {
    const bug = new Bug(req.body);

    await bug.save();

    res.send(bug);
});

router.get("/", async (_req, res) => {
    const bugs = await Bug.find({}).sort("solved");

    res.send(bugs);
});

router.patch("/solve/:errorId", async (req, res) => {
    const bug = await Bug.findById(req.params.errorId);

    if (!bug)
        return res
            .status(404)
            .send({ error: "The bug does not exist in the database" });

    const result = await Bug.findByIdAndUpdate({ resolved: true }, { new: true });
    result
        ? res.send(result)
        : res.status(500).send({ error: "Error resolving a bug" });
});

export async function saveBug(message) {
    await new Bug({ message }).save();
}

export default router;
