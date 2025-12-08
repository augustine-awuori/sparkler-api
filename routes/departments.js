import express from "express";

import { Department } from "../models/department.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const { name, school } = req.body;

  if (!name || !school)
    return res.status(400).send({ error: "Name and school are required." });

  res.send(await new Department({ name, faculty: school }).save());
});

router.get("/", async (_req, res) => {
  const departments = await Department.find({});

  res.send(departments);
});

export default router;
