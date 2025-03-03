import express from "express";
import mongoose from "mongoose";

import { Community, validateCommunity } from "../models/community.js";
import { getClient } from "../utils/func.js";
import { User } from "../models/user.js";
import auth from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";

const router = express.Router();

router.post("/", [auth, validate(validateCommunity)], async (req, res) => {
    const community = new Community({
        members: [req.user._id.toString()],
        creator: req.user._id,
        ...req.body,
    });

    await community.save();

    res.send(community);
});

router.get("/", async (_req, res) => {
    const communities = await Community.find({}).sort("_id");

    res.send(communities);
});

router.get("/:communityId", async (_req, res) => {
    const community = await Community.findById(req.params.communityId);

    community
        ? res.send(community)
        : res.status(404).send({ error: "Community not found!" });
});

router.get("/sparkles/:communityId", async (_req, res) => {
    const client = getClient();
    if (!client) return res.status(500).send({ error: 'Failed to initialize client' });

    const response = await client
        .feed("communities", req.params.communityId)
        .get({
            enrich: true,
            ownReactions: true,
            withOwnChildren: true,
            withOwnReactions: true,
            withRecentReactions: true,
            withReactionCounts: true,
        });

    response
        ? res.send(response)
        : res.status(500).send({ error: "Error fetching community sparkles!" });
});

router.patch("/:communityId/join", auth, async (req, res) => {
    const { communityId } = req.params;
    const userId = req.user._id;

    if (!mongoose.isValidObjectId(userId))
        return res.status(400).send({ error: "Invalid user id" });

    const user = await User.findById(userId);
    if (!user)
        return res
            .status(404)
            .send({ error: "User does not exist in the database!" });

    const community = await Community.findById(communityId);
    if (!community)
        return res
            .status(404)
            .send({ error: "Community does not exist in the database!" });

    user.communities.unshift(communityId);
    user.save();
    community.members.unshift(userId);
    await community.save();

    res.send(community);
});

router.patch("/:communityId", auth, async (req, res) => {
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
});

router.delete("/:communityId", auth, async (req, res) => {
    const { communityId } = req.params;

    const community = await Community.findById(communityId);
    if (!community)
        return res
            .status(404)
            .send({ error: "Community does not exist in the database!" });

    if (community.creator.toString() !== req.user._id.toString())
        return res.status(401).send({ error: "You are not the community creator" });

    const deleted = await Community.findByIdAndDelete(communityId);
    deleted
        ? res.send(deleted)
        : res.status(500).send({ error: "Something failed" });
});

export default router;
