import express from "express";
import { nanoid } from "nanoid";

import { addReaction, getClient, getTargetFeeds } from "../utils/func.js";
import { User } from "../models/user.js";
import auth from "../middlewares/auth.js";

const router = express.Router();
const SPARKLE_VERB = "sparkle";

router.post("/", auth, async (req, res) => {
    try {
        const client = getClient();
        if (!client)
            return res.status(500).send({ error: `Error initializing a client` });

        const { text, images } = req.body;
        const collection = await client.collections.add(SPARKLE_VERB, nanoid(), {
            text,
        });
        const time = getEATZone();
        const mentionsIdsTags = prepareMentionsIdsTags(
            getUserIds(getMentions(text))
        );
        const hashtagTags = prepareHashtagTags(getHashtags(text), req.user);
        const userId = req.user._id.toString();
        const userFeed = client.feed("user", userId);

        const sparkle = await userFeed.addActivity({
            actor: `SU:${userId}`,
            verb: SPARKLE_VERB,
            attachments: { images },
            object: `SO:${SPARKLE_VERB}:${collection.id}`,
            foreign_id: userId + time,
            time,
            to: [...mentionsIdsTags, ...hashtagTags],
        });

        sparkle
            ? res.send(sparkle)
            : res.status(500).send({ error: "Couldn't create the sparkle" });
    } catch (error) {
        res.status(500).send({ error: "Error creating a sparkle" });
    }
});

router.post("/quote", auth, async (req, res) => {
    try {
        const client = getClient();
        if (!client)
            return res.status(500).send({ error: `Error initializing a client` });

        const userId = req.user._id.toString();
        const { images, text, quoted_activity } = req.body;
        const actorId = quoted_activity.actor.id;
        const notifyActor = userId !== actorId;
        const verb = "quote";

        await addReaction({
            actorId,
            kind: verb,
            sparkleId: quoted_activity.id,
            data: { id: userId, text },
            targetFeeds: notifyActor ? getTargetFeeds(actorId) : [],
        });

        const collection = await client.collections.add(verb, nanoid(), {
            text,
        });

        const time = getEATZone();
        const userFeed = client.feed("user", userId);
        const mentionsIdsTags = prepareMentionsIdsTags(
            getUserIds(getMentions(text))
        );
        const hashtagTags = prepareHashtagTags(getHashtags(text), req.user);

        const quote = await userFeed?.addActivity({
            actor: `SU:${userId}`,
            attachments: { images },
            foreign_id: userId + time,
            object: `SO:${verb}:${collection.id}`,
            quoted_activity,
            target: notifyActor ? actorId : undefined,
            time,
            to: [...mentionsIdsTags, ...hashtagTags],
            verb,
        });
        quote
            ? res.send(quote)
            : res.status(500).send({ error: "Couldn't quoting the sparkle" });
    } catch (error) {
        res.status(500).send({ error: "Error quoting a sparkle" });
    }
});

router.delete("/:sparkleId", auth, async (req, res) => {
    try {
        const { sparkleId } = req.params;

        const client = getClient();

        const userFeed = client.feed("user", req.user._id.toString());
        res.send(await userFeed?.removeActivity(sparkleId));
    } catch (error) {
        res.status(500).send({ error: "Error deleting a sparkle" });
    }
});

function getEATZone() {
    const time = new Date();

    return new Date(time.getTime() + 3 * 60 * 60 * 1000).toISOString();
}

function prepareMentionsIdsTags(mentionsIds = []) {
    return mentionsIds.length
        ? mentionsIds.map((id) => `notification:${id}`)
        : [];
}

async function getUserIds(usernames) {
    const users = await User.find({ username: { $in: usernames } });

    return users.map((user) => user._id.toString());
}

function getMentions(text = "") {
    const mentionPattern = /@(\w+)/g;
    let match;
    const mentions = [];

    while ((match = mentionPattern.exec(text)) !== null) {
        mentions.push(match[1]);
    }

    return mentions;
}

function getHashtags(text = "") {
    const hashtagPattern = /#(\w+)/g;
    let match;
    const hashtags = [];

    while ((match = hashtagPattern.exec(text)) !== null) {
        hashtags.push(match[1]);
    }

    return hashtags;
}

function prepareHashtagTags(hashtags = [], user) {
    if (!hashtags.length || !user) return [];

    const computed = [
        ...hashtags.map((tag) => `hashtags:${tag.toLowerCase()}`),
        "hashtags:general",
    ];

    if (user.verified) computed.push("hashtags:verified");

    return computed;
}

export default router;
