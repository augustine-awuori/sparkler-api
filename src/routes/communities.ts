import { Router } from "express";
import mongoose from "mongoose";

import { authedHandler, handler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { validate } from "../http/middlewares/validate.js";
import { Community, validateCommunity } from "../models/community.js";
import { Sparkler } from "../models/sparkler.js";
import { streamClient } from "../services/stream.js";
import { sendPushNotificationTo } from "../utils/pushNotifications.js";

type CommunityParams = { communityId: string };

const NOT_FOUND = { error: "Community does not exist in the database!" };

const router = Router();

router.post(
  "/",
  auth,
  validate(validateCommunity),
  authedHandler(async (req, res) => {
    try {
      const community = new Community({
        creator: req.user.id,
        ...(req.body as object),
        members: [req.user.id],
      });
      await community.save();

      res.send(community);
    } catch (err) {
      req.log.error({ err }, "Error creating a community");
      res.status(500).send({ error: "Error creating a community level" });
    }
  }),
);

router.get(
  "/",
  handler(async (_req, res) => {
    res.send(await Community.find({}).sort("_id"));
  }),
);

router.get(
  "/:communityId",
  handler<CommunityParams>(async (req, res) => {
    const community = await Community.findById(req.params.communityId);

    community ? res.send(community) : res.status(404).send({ error: "Community not found!" });
  }),
);

// Unreachable: GET /:communityId above captures "levels". Kept where it was so
// the port does not change routing; see the "FIXED IN PHASE 6" baseline test.
router.get(
  "/levels",
  handler(async (req, res) => {
    try {
      const levels = await streamClient().feeds.queryMembershipLevels({
        filter: {
          custom: {
            $contains: { ...(req.body as object) },
          },
        },
        sort: [{ field: "priority", direction: -1 }],
      });
      res.send(levels);
    } catch (err) {
      req.log.error({ err }, "Error fetching community levels");
      res.status(500).send({ error: "Error fetching community levels" });
    }
  }),
);

router.patch(
  "/:communityId/join",
  auth,
  authedHandler<CommunityParams>(async (req, res) => {
    try {
      const userId = req.user.id;

      if (!mongoose.isValidObjectId(userId))
        return res.status(400).send({ error: "Invalid user id" });

      const user = await Sparkler.findById(userId);
      if (!user) return res.status(404).send({ error: "User does not exist in the database!" });

      const community = await Community.findById(req.params.communityId);
      if (!community) return res.status(404).send(NOT_FOUND);

      // The old Set-based dedupe compared ObjectIds with a string, so it never
      // matched and every join appended the user again.
      if (!community.members.some((member) => member.equals(userId)))
        community.members.push(new mongoose.Types.ObjectId(userId));
      await community.save();

      // Looked up separately rather than populated: a populated creator would be
      // serialised into the response below, leaking their authCode hash and push
      // token to whoever joined.
      const creator = await Sparkler.findById(community.creator);
      const creatorExpoPushToken = creator?.custom?.expoPushToken?.data;
      if (creatorExpoPushToken)
        void sendPushNotificationTo(creatorExpoPushToken, {
          message: `${user.name} is now a member of your community`,
          title: community.name,
        });

      res.send(community);
    } catch (err) {
      req.log.error({ err }, "Error joining a community");
      res.status(500).send({ error: "Error joining a community" });
    }
  }),
);

router.patch(
  "/:communityId",
  auth,
  authedHandler<CommunityParams>(async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!(await Community.findById(communityId))) return res.status(404).send(NOT_FOUND);

      const updated = await Community.findByIdAndUpdate(communityId, req.body as object, {
        returnDocument: "after",
      });
      updated
        ? res.send(updated)
        : res.status(500).send({ error: "Something failed to update community" });
    } catch (err) {
      req.log.error({ err }, "Error updating a community");
      res.status(500).send({ error: "Error updating community" });
    }
  }),
);

router.delete(
  "/:communityId",
  auth,
  authedHandler<CommunityParams>(async (req, res) => {
    try {
      const { communityId } = req.params;
      const community = await Community.findById(communityId);
      if (!community) return res.status(404).send(NOT_FOUND);

      // Previously compared against an undeclared `userId`, so every delete threw.
      if (community.creator.toString() !== req.user.id)
        return res.status(401).send({ error: "You are not the community creator" });

      await streamClient().feeds.deleteMembershipLevel({ id: communityId });

      const deleted = await Community.findByIdAndDelete(communityId);
      deleted ? res.send(deleted) : res.status(500).send({ error: "Something failed" });
    } catch (err) {
      req.log.error({ err }, "Error deleting a community");
      res.status(500).send({ error: "Error deleting community" });
    }
  }),
);

router.patch(
  "/:communityId/leave",
  auth,
  authedHandler<CommunityParams>(async (req, res) => {
    try {
      const { communityId } = req.params;
      if (!(await Community.findById(communityId))) return res.status(404).send(NOT_FOUND);

      const userId = req.user.id;
      await streamClient().feeds.updateFeedMembers({
        feed_group_id: "user",
        feed_id: userId,
        operation: "remove",
        members: [{ user_id: userId, membership_level: communityId }],
      });
      res.send({ message: "Left the community successfully" });
    } catch (err) {
      req.log.error({ err }, "Error leaving a community");
      res.status(500).send({ error: "Error leaving a community" });
    }
  }),
);

export default router;
