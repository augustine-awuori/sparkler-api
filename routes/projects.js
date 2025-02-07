import express from "express";
import { nanoid } from "nanoid";

import {
    getClient,
    getEATZone,
    getHashtags,
    getMentions,
    getUserIds,
    prepareHashtagTags,
    prepareMentionsIdsTags,
} from "../utils/func.js";
import { sendPushNotificationTo } from "./expoPushNotifications.js";
import { User } from "../models/user.js";
import auth from "../middlewares/auth.js";

const router = express.Router();
const PROJECT_VERB = "project";

router.post("/", auth, async (req, res) => {
    try {
        const client = getClient();
        if (!client)
            return res.status(500).send({ error: `Error initializing a client` });

        const { description, mention } = req.body;

        const collection = await client.collections.add(
            PROJECT_VERB,
            nanoid(),
            req.body
        );
        const time = getEATZone();
        const mentionsIdsTags = prepareMentionsIdsTags(
            await getUserIds(getMentions(mention))
        );
        const hashtagTags = prepareHashtagTags(
            getHashtags(`${description} ${mention} #project`),
            req.user
        );
        const userId = req.user._id.toString();

        const project = await client.feed("user", userId)?.addActivity({
            actor: `SU:${userId}`,
            verb: PROJECT_VERB,
            object: `SO:${PROJECT_VERB}:${collection.id}`,
            foreign_id: userId + time,
            target: `timeline:${userId}`,
            time,
            to: [...mentionsIdsTags, ...hashtagTags],
        });

        const tokens = (await User.find({})).map((user) => {
            const token = user.expoPushToken?.data;
            if (token && user._id.toString() !== userId) return token;
        });
        sendPushNotificationTo(tokens, {
            message: description,
            title: `${req.user.name} has a new project`,
        });

        project
            ? res.send(project)
            : res.status(500).send({ error: "Couldn't create the project" });
    } catch (error) {
        res.status(500).send({ error: `Error creating a project ${error}` });
    }
});

export default router;
