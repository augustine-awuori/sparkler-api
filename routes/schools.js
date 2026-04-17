import express from "express";

import { School } from "../models/school.js";

const router = express.Router();

router.get("/", async (req, res) => {
  const schools = await School.find({});
  res.send(schools);
});

export default router;
