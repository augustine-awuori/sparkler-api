import bcrypt from "bcrypt";
import express from "express";

import { User } from "../models/user.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { email, role, password, name } = req.body;

    if (!email || !role || !password || !name)
      return res.status(400).send({ error: "Invalid info" });

    let user = await User.find({ email });
    if (user) return res.status(400).send({ error: "User already exists" });

    user = new User({ email, role, name });
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password.toString(), salt);
    user.password = hashedPassword;
    await user.save();

    const token = user.generateAuthToken();
    res.header("x-auth-token", token).send(token);
  } catch (error) {
    res.status(500).send({ error: "Error loggin  " + error });
  }
});

router.get("/", async (req, res) => {
  try {
    const users = await User.find({});
    res.send(users);
  } catch (error) {
    console.error(`Error getting users`);
    res.status(500).send({ error: "Error getting users" });
  }
});

export default router;
