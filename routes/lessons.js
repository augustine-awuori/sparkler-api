import express from "express";
import mongoose from "mongoose";

import { Lesson, validateLesson } from "../models/lesson";
import auth from "../middlewares/auth";
import validator from "../middlewares/validate";

const router = express.Router();

router.post("/", [auth, validator(validateLesson)], async (req, res) => {
    const lesson = new Lesson(req.body);

    await lesson.save();

    res.send(lesson);
});

router.get("/:course", async (req, res) => {
    const course = req.params.course;
    if (!mongoose.isValidObjectId(course))
        return res.status(400).send({ error: "Invalid course id." });

    const lessons = await Lesson.find({ course }).populate("course");

    lessons
        ? res.send(lessons)
        : res.status(404).send({ error: "Couldn't find course's lesson" });
});

export default router;
