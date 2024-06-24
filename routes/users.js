import express from "express";

import { User, validateUser } from "../models/user.js";
import auth from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";

const router = express.Router();

router.post("/", validate(validateUser), async (req, res) => {
  const { avatar, email, name } = req.body;

  let user = await User.findOne({ email });
  if (user)
    return res.status(400).send({ error: "User is already registered" });

  user = new User({ avatar, email, name });
  await user.save();

  res.status(201).send(user);
});

router.get("/", async (_req, res) => {
  const users = await User.find({});

  res.send(users);
});

router.patch("/", auth, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user._id, req.body, {
    new: true,
  });

  if (!user)
    return res.status(404).send({ error: "User don't exist in the database" });

  res.send(user);
});

export default router;
