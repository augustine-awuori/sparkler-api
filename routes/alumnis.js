import express from "express";

import { Alumni } from "../models/alumni.js";

const router = express.Router();

router.post("/", async (req, res) => {
  const alumni = await new Alumni({ ...req.body }).save();

  res.send(alumni);
});

router.get("/", async (req, res) => {
  const alumnis = await Alumni.find({});

  res.send(alumnis);
});

export default router;
