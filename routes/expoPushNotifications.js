import { Expo } from "expo-server-sdk";
import express from "express";
import mongoose from "mongoose";

import { User } from "../models/user.js";
import auth from "../middlewares/auth.js";
import sendPushNotification from "../utils/pushNotifications.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
    const { message, targetUserId } = req.body;

    if (!mongoose.isValidObjectId(targetUserId))
        return res.status(400).send({ error: "Invalid target user id" });

    const targetUser = await User.findById(targetUserId);
    if (!targetUser)
        return res
            .status(404)
            .send({ error: "Target user doesn't exist in the DB" });

    const { expoPushToken } = targetUser;
    if (Expo.isExpoPushToken(expoPushToken))
        await sendPushNotification(expoPushToken, message);

    res.status(201).send();
});

export default router;
