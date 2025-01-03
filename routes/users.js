import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import _ from "lodash";
import { StreamChat } from "stream-chat";

import { findUniqueUsername, getUserFeedToken } from "../services/users.js";
import { getClient } from "../utils/func.js";
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
  user = new User({ email, name, username });
  const token = serverClient.createToken(user._id.toString());
  user.feedToken = token;
  user.chatToken = token;
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

router.patch("/followers", auth, async (req, res) => {
  try {
    const { leaderId } = req.body;

    if (!leaderId)
      return res.status(400).json({ error: "Leader's ID not provided" });

    const [leader, follower] = await Promise.all([
      User.findById(leaderId),
      User.findById(req.user._id),
    ]);

    if (!leader)
      return res.status(404).json({ error: "Leader does not exist" });

    if (!follower)
      return res.status(404).json({ error: "Follower does not exist" });

    const isFollowing = !leader.followers?.[follower._id];

    const leaderUpdate = isFollowing
      ? { $unset: { [`followers.${follower._id}`]: "" } }
      : { $set: { [`followers.${follower._id}`]: follower._id } };

    const followerUpdate = isFollowing
      ? { $unset: { [`following.${leader._id}`]: "" } }
      : { $set: { [`following.${leader._id}`]: leader._id } };

    await Promise.all([
      User.findByIdAndUpdate(leaderId, leaderUpdate),
      User.findByIdAndUpdate(follower._id, followerUpdate, { new: true }),
    ]);

    return res.send(await User.findById(req.user._id));
  } catch (error) {
    return res
      .status(500)
      .json({ error: "Server error, please try again later" });
  }
});

router.get("/", async (_req, res) => {
  const users = await User.find({});

  res.send(users);
});

router.get("/userFollowings/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.isValidObjectId(userId))
    return res.status(400).send({ error: "Invalid user id" });

  const client = getClient();
  if (!client)
    return res.status(500).send({ error: "Client couldn't be initialized" });

  const response = await client?.feed("user", userId).followStats({});

  response
    ? res.send(response)
    : res.status(500).send({ error: "Could not fetch followings from Stream" });
});

router.get("/:userId/following", async (req, res) => {
  const { userId } = req.params;

  if (!userId) return res.status(400).send({ error: "Invalid user id" });

  try {
    const client = getClient();

    const response = await client?.feed("user", userId).following();

    response
      ? res.send(response.results)
      : res.status(500).send({ error: "Something went wrong" });
  } catch (error) {
    res.send({ error: `Error fetching user's sparkles ${error}` });
  }
});

router.get("/:userId/followers", async (req, res) => {
  const { userId } = req.params;

  if (!userId) return res.status(400).send({ error: "Invalid user id" });

  try {
    const client = getClient();

    const response = await client?.feed("user", userId).followers();

    response
      ? res.send(response.results)
      : res.status(500).send({ error: "Something went wrong" });
  } catch (error) {
    res.send({ error: `Error fetching user's sparkles ${error}` });
  }
});

router.get("/:userId/sparkles", async (req, res) => {
  const { userId } = req.params;

  if (!userId) return res.status(400).send({ error: "Invalid user id" });

  try {
    const client = getClient();

    const response = await client?.feed("user", userId).get({
      enrich: true,
      ownReactions: true,
      withOwnChildren: true,
      withOwnReactions: true,
      withReactionCounts: true,
      withRecentReactions: true,
    });

    response
      ? res.send(response.results)
      : res.status(500).send({ error: "Something went wrong" });
  } catch (error) {
    res.send({ error: `Error fetching user's sparkles ${error}` });
  }
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

router.get("/profile/:username", async (req, res) => {
  const user = await User.findOne({ username: req.params.username });

  if (!user) return res.status(404).send({ error: "User not found" });

  res.render("profile", {
    ogTitle: `${user.name}'s Profile`,
    ogDescription: user.bio,
    ogImage: user.profileImage,
    ogUrl: `https://sparkler.lol/${user.username}`,
  });
});

router.patch("/", auth, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user._id, req.body, {
    new: true,
  });

  if (!user)
    return res.status(404).send({ error: "User don't exist in the database" });

  res.send(user);
});

router.delete("/", auth, async (req, res) => {
  const result = await User.findByIdAndDelete(req.user._id);

  res.send(result);
});

export default router;
