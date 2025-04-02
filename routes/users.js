import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import _ from "lodash";
import { StreamChat } from "stream-chat";

import { findUniqueUsername, getUserFeedToken } from "../services/users.js";
import { createOrGetUser, getClient } from "../utils/func.js";
import {
  User,
  validateUser,
  validateUserWithGoogleAccount,
} from "../models/user.js";
import auth from "../middlewares/auth.js";
import admin from "../middlewares/admin.js";
import validate from "../middlewares/validate.js";

const serverClient = StreamChat.getInstance(
  process.env.chatApiKey,
  process.env.chatApiSecret
);

const router = express.Router();

router.post("/", validate(validateUser), async (req, res) => {
  const { email, name, authCode } = req.body;

  const user = await User.findOne({ email });
  if (!user)
    return res.status(400).send({ error: "Auth code isn't generated" });

  const isValidAuthCode = await bcrypt.compare(
    authCode.toString(),
    user.authCode
  );
  if (!isValidAuthCode)
    return res
      .status(400)
      .send({ error: "Invalid username and/or auth code." });

  if (user.invalid) {
    user.name = name;
    user.username = await findUniqueUsername(name);
    user.invalid = false;
    user.authCode = "";
    await user.save();

    const { chatToken, feedToken, invalid, username, verified, email } = user;
    await (
      await createOrGetUser(user)
    )?.update({
      chatToken,
      feedToken,
      email,
      invalid,
      name,
      username,
      verified,
    });
  } else {
    user.authCode = "";
    await user.save();
  }

  const authToken = user.generateAuthToken();
  res
    .status(201)
    .header("x-auth-token", authToken)
    .header("access-control-expose-headers", "x-auth-token")
    .send(authToken);
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

      user = new User({ ...req.body, username });

      const token = serverClient.createToken(user._id.toString());
      user.feedToken = token;
      user.chatToken = token;

      await user.save();
    }

    res
      .header("x-auth-token", user.generateAuthToken())
      .header("access-control-expose-headers", "x-auth-token")
      .send(user);
  }
);

router.post("/follow", auth, async (req, res) => {
  const { action, userId } = req.body;

  const client = getClient();
  if (!client)
    return res.status(500).send({ error: "Error initializing client" });

  const timelineFeed = client?.feed("timeline", req.user._id.toString());
  await timelineFeed?.[action]("user", userId);

  res.status(201).send();
});

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

  const sanitizedUsers = users.map((user) =>
    _.omit(user.toObject(), ["expoPushToken", "chatToken", "feedToken"])
  );

  res.send(sanitizedUsers);
});

router.get("/userFollowings/:userId", async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.isValidObjectId(userId))
    return res.status(400).send({ error: "Invalid user id" });

  const client = getClient();
  if (!client)
    return res.status(500).send({ error: "Client couldn't be initialized" });

  let response = await client?.feed("user", userId).followStats({});
  if (!response)
    return res
      .status(500)
      .send({ error: "Could not fetch followings from Stream" });

  const userFeed = client.feed("user", userId);
  const timelineFeed = client.feed("timeline", userId);

  const followerStats = await userFeed.followStats({
    followers_slugs: ["timeline"],
  });

  const followingStats = await timelineFeed.followStats({
    following_slugs: ["user"],
  });

  res.send({
    ...response,
    results: {
      followers: {
        ...response.results.followers,
        count: followerStats.results.followers.count || 0,
      },
      following: {
        count: followingStats.results.following.count || 0,
        feed: `user:${userId.toString()}`,
      },
    },
  });
});

router.get("/:userId/following", async (req, res) => {
  const { userId } = req.params;

  if (!userId) return res.status(400).send({ error: "Invalid user id" });

  try {
    const client = getClient();

    const response = await client?.feed("timeline", userId).following();

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

router.patch("/sync", [auth, admin], async (_req, res) => {
  (await User.find({})).forEach(async (user) => {
    const {
      invalid,
      name,
      username,
      profileImage,
      coverImage,
      isAdmin,
      verified,
    } = user;

    if (!invalid)
      await (
        await createOrGetUser(user)
      )?.update({
        name,
        username,
        profileImage,
        coverImage,
        isAdmin,
        verified,
      });
  });

  res.status(201).send();
});

router.patch("/", auth, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user._id, req.body, {
    new: true,
  });

  if (!user)
    return res
      .status(404)
      .send({ error: "User does not exist in the database" });

  const { name, username, profileImage, coverImage, verified, isAdmin } = user;
  const streamUser = await (
    await createOrGetUser(user)
  )?.update({
    ...req.body,
    name,
    username,
    profileImage,
    coverImage,
    verified,
    isAdmin,
  });

  streamUser
    ? res.send(user)
    : res
      .status(500)
      .send({ error: `Error updating user info: ${streamUser}` });
});

router.delete("/", auth, async (req, res) => {
  const result = await User.findByIdAndDelete(req.user._id);

  res.send(result);
});

export default router;
