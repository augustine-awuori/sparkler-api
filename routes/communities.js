import express from "express";
import mongoose from "mongoose";
import { StreamClient } from "@stream-io/node-sdk";

import { Community, validateCommunity } from "../models/community.js";
import { Sparkler } from "../models/sparkler.js";
import auth from "../middlewares/auth.js";
import sendPushNotification from "../utils/pushNotifications.js";
import validate from "../middlewares/validate.js";

const client = new StreamClient(
  process.env.NEW_FEED_API_KEY,
  process.env.NEW_CHAT_API_SECRET,
);

const router = express.Router();

router.post("/", [auth, validate(validateCommunity)], async (req, res) => {
  try {
    const userId = req.user.id.toString();

    const community = new Community({ creator: req.user.id, ...req.body });
    community.members = [userId];
    await community.save();

    res.send(community);
  } catch (error) {
    console.error(`Error creating a community level: ${error}`);
    res.status(500).send({ error: "Error creating a community level" });
  }
});

router.get("/", async (_req, res) => {
  const communities = await Community.find({}).sort("_id");

  res.send(communities);
});

router.get("/:communityId", async (req, res) => {
  const community = await Community.findById(req.params.communityId);

  community
    ? res.send(community)
    : res.status(404).send({ error: "Community not found!" });
});

router.get("/levels", async (req, res) => {
  try {
    const levels = await client.feeds.queryMembershipLevels({
      filter: {
        custom: {
          $contains: { ...req.body },
        },
      },
      sort: [{ field: "priority", direction: -1 }],
    });
    res.send(levels);
  } catch (error) {
    console.error(`Error fetching community levels: ${error}`);
    res.status(500).send({ error: "Error fetching community levels" });
  }
});

router.patch("/:communityId/join", auth, async (req, res) => {
  try {
    const { communityId } = req.params;
    const userId = req.user.id;

    if (!mongoose.isValidObjectId(userId))
      return res.status(400).send({ error: "Invalid user id" });

    const user = await Sparkler.findById(userId);
    if (!user)
      return res
        .status(404)
        .send({ error: "User does not exist in the database!" });

    const community = await Community.findById(communityId).populate("creator");
    if (!community)
      return res
        .status(404)
        .send({ error: "Community does not exist in the database!" });

    community.members = Array.from(new Set(community.members).add(userId));
    await community.save();

    const { creator } = community;
    const creatorExpoPushToken = creator?.custom?.expoPushToken?.data;
    if (creatorExpoPushToken)
      sendPushNotification(creatorExpoPushToken, {
        message: `${user.name} is now a member of your community`,
        title: community.name,
      });

    res.send(community);
  } catch (error) {
    console.error(`Error joining a community: ${error}`);
    res.status(500).send({ error: "Error joining a community" });
  }
});

router.patch("/:communityId", auth, async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community)
      return res
        .status(404)
        .send({ error: "Community does not exist in the database!" });

    const updated = await Community.findByIdAndUpdate(communityId, req.body, {
      new: true,
    });
    updated
      ? res.send(updated)
      : res.status(500).send({ error: "Something failed to update community" });
  } catch (error) {
    console.error(`Error updating community ${error}`);
    res.status(500).send({ error: "Error updating community" });
  }
});

router.delete("/:communityId", auth, async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community)
      return res
        .status(404)
        .send({ error: "Community does not exist in the database!" });

    if (community.creator.toString() !== userId)
      return res
        .status(401)
        .send({ error: "You are not the community creator" });

    await client.feeds.deleteMembershipLevel({ id: communityId });

    const deleted = await Community.findByIdAndDelete(communityId);
    deleted
      ? res.send(deleted)
      : res.status(500).send({ error: "Something failed" });
  } catch (error) {
    console.error(`Error deleting community ${error}`);
    res.status(500).send({ error: "Error deleting community" });
  }
});

router.patch("/:communityId/leave", auth, async (req, res) => {
  try {
    const { communityId } = req.params;
    const community = await Community.findById(communityId);
    if (!community)
      return res
        .status(404)
        .send({ error: "Community does not exist in the database!" });

    const userId = req.user.id.toString();
    await client.feeds.updateFeedMembers({
      feed_group_id: "user",
      feed_id: userId,
      operation: "remove",
      members: [{ user_id: userId, membership_level: communityId }],
    });
    res.send({ message: "Left the community successfully" });
  } catch (error) {
    console.error(`Error leaving a community: ${error}`);
    res.status(500).send({ error: "Error leaving a community" });
  }
});

export default router;
