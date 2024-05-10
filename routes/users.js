import express from "express";

import { User, validateUser } from "../models/user";
import validate from "../middlewares/validate";

const router = express.Router();

router.post("/", validate(validateUser), async (req, res) => {
  const { email, name } = req.body;

  let user = await User.findOne({ email });
  if (user)
    return res.status(400).send({ error: "User is already registered" });

  user = new User({ email, name });
  await user.save();

  res.status(201).send(user);
});

router.get("/", async (_req, res) => {
  const users = await User.find({});

  res.send(users);
});

export default router;
