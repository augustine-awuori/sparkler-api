import express from "express";
import bcrypt from "bcrypt";
import _ from "lodash";
import { StreamChat } from "stream-chat";

import { findUniqueUsername, getUserFeedToken } from "../services/users.js";
import {
  User,
  validateUser,
  validateUserWithGoogleAccount,
} from "../models/user.js";
import auth from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";

const serverClient = StreamChat.getInstance(
  process.env.chatApiKey,
  process.env.chatApiSecret
);

const router = express.Router();

router.post("/", validate(validateUser), async (req, res) => {
  const { email, name, password } = req.body;

  let user = await User.findOne({ email });
  if (user) return res.status(400).send({ error: "Email is already taken" });

  const username = await findUniqueUsername(name);
  const token = serverClient.createToken(user._id);
  user = new User({
    email,
    name,
    username,
    feedToken: token,
    chatToken: token,
  });
  const salt = await bcrypt.genSalt(10);
  user.password = await bcrypt.hash(password, salt);
  await user.save();

  res
    .status(201)
    .header("x-auth-token", user.generateAuthToken())
    .header("access-control-expose-headers", "x-auth-token")
    .send(_.omit(user, "password"));
});

router.post(
  "/quick",
  validate(validateUserWithGoogleAccount),
  async (req, res) => {
    const { email, name } = req.body;

    let user = await User.findOne({ email });

    let username = name.toLowerCase().replace(/\s+/g, "");

    if (!user) {
      let found = await User.findOne({ username });

      while (found) {
        const randomNum = Math.floor(Math.random() * 10000);
        username = `${username}${randomNum}`;
        found = await User.findOne({ username });
      }

      user = new User({
        ...req.body,
        username,
      });

      const token = serverClient.createToken(user._id.toString());
      user.feedToken = token;
      user.chatToken = token;

      await user.save();
    }

    res
      .header("x-auth-token", user.generateAuthToken())
      .header("access-control-expose-headers", "x-auth-token")
      .send(_.omit(user.toObject(), ["password"]));
  }
);

router.get("/", async (_req, res) => {
  const users = await User.find({});

  res.send(users);
});

router.get("/:username", async (req, res) => {
  const user = await User.findOne({ username: req.params.username });

  user ? res.send(user) : res.status(404).send({ error: "User not found" });
});

router.get("/feedToken", auth, async (req, res) => {
  const user = await User.findById(req.user._id);

  if (!user) return res.status(404).send({ error: "User doesn't exist" });

  const feedToken = getUserFeedToken(user._id);
  user.feedToken = feedToken;
  await user.save();

  res.send(feedToken);
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
