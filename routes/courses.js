import express from "express";

import { Course } from "../models/course.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { name, school } = req.body;

  if (!name || !school)
    return res.status(400).send({ error: "Name and school are required." });

  res.send(await new Course({ name, school }).save());
});

router.get("/", async (req, res) => {
  const courses = await Course.find({});
  res.send(courses);
});

export default router;
