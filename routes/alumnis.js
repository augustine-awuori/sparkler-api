import express from "express";

import { Alumni } from "../models/alumni.js";

const router = express.Router();

router.post("/", async (req, res) => {
  let alumni = await Alumni.findOne({ regNo: req.body.regNo.toUpperCase() });
  if (alumni)
    return res
      .status(200)
      .send({ message: "Alumni with this regNo already exists." });

  alumni = await new Alumni({ ...req.body }).save();

  res.send(alumni);
});

router.get("/", async (_req, res) => {
  const alumnis = await Alumni.find({}).populate("school");

  res.send(alumnis);
});

router.get("/count", async (_req, res) => {
  const count = await Alumni.countDocuments();
  res.send({ count });
});

export default router;
