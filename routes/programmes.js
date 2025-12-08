import express from "express";

import { Programme } from "../models/programme.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { name, school } = req.body;

  if (!name || !school)
    return res.status(400).send({ error: "Name and school are required." });

  res.send(await new Programme({ name, school }).save());
});

router.get("/", async (req, res) => {
  const courses = await Programme.find({});

  res.send(courses);
});

export default router;
