import { Expo } from "expo-server-sdk";
import express from "express";
import mongoose from "mongoose";

import { User } from "../models/user.js";
import auth from "../middlewares/auth.js";
import sendPushNotification from "../utils/pushNotifications.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
    const { message, targetUsersId } = req.body;

    targetUsersId.forEach(async targetUserId => {
        if (!mongoose.isValidObjectId(targetUserId))
            return;

        const targetUser = await User.findById(targetUserId);
        if (!targetUser) return;

        const { expoPushToken } = targetUser;
        if (Expo.isExpoPushToken(expoPushToken?.data))
            await sendPushNotification(expoPushToken?.data, message);
    });

    res.status(201).send();
});

export default router;
