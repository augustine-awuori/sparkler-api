import { Router } from "express";

import { handler } from "../http/handler.js";
import { Department } from "../models/department.js";

interface DepartmentBody {
  name?: string;
  school?: string;
}

const router = Router();

router.post(
  "/",
  handler<Record<string, string>, DepartmentBody>(async (req, res) => {
    const { name, school } = req.body;

    if (!name || !school)
      return res.status(400).send({ error: "Name and school are required." });

    res.send(await new Department({ name, school }).save());
  }),
);

router.get(
  "/",
  handler(async (_req, res) => {
    res.send(await Department.find({}));
  }),
);

export default router;
