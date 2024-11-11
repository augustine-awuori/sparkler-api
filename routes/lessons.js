import express from "express";
import mongoose from "mongoose";

import { Lesson, validateLesson } from "../models/lesson.js";
import auth from "../middlewares/auth.js";
import validator from "../middlewares/validate.js";

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

router.patch("/:lessonId", auth, async (req, res) => {
  const lessonId = req.params.lessonId;

  if (!mongoose.isValidObjectId(lessonId))
    return res.status(400).send({ error: "Invalid lesson ID" });

  const lesson = await Lesson.findById(lessonId);
  if (!lesson)
    return res
      .status(404)
      .send({ error: "Lesson does not exist in the database" });

  const students = lesson.students || {};
  const studentId = req.user._id.toString();
  if (!students[studentId]) {
    students[studentId] = studentId;
  }

  const result = await Lesson.findOneAndUpdate(
    lessonId,
    { students },
    { new: true }
  );

  result
    ? res.send(result)
    : res.status(500).send({ error: "Lesson completion not saved" });
});

export default router;
