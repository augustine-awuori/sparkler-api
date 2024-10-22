import express from "express";

import { Course, validateCourse } from "../models/course.js";
import validatingWith from "../middlewares/validate.js";

const router = express.Router();

router.post("/", validatingWith(validateCourse), async (req, res) => {
    const course = new Course({ ...req.body, lecturer: req.user._id });

    await course.save();

    res.send(course);
});

router.get("/", async (_req, res) => {
    const courses = await Course.find({})
        .populate("lecturer")
        .populate("category");

    res.send(courses);
});

export default router;
