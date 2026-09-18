import { Router } from "express";

import { handler } from "../http/handler.js";
import { Alumni, type IAlumni } from "../models/alumni.js";

const router = Router();

router.post(
  "/",
  handler<Record<string, string>, Partial<IAlumni>>(async (req, res) => {
    const regNo = req.body.regNo?.toUpperCase();

    if (await Alumni.findOne({ regNo }))
      return res.status(200).send({ message: "Alumni with this regNo already exists." });

    res.send(await new Alumni({ ...req.body }).save());
  }),
);

router.get(
  "/",
  handler(async (_req, res) => {
    res.send(await Alumni.find({}).populate("school"));
  }),
);

router.get(
  "/count",
  handler(async (_req, res) => {
    res.send({ count: await Alumni.countDocuments() });
  }),
);

export default router;
