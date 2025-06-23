import { Expo } from "expo-server-sdk";
import express from "express";
import mongoose from "mongoose";

import { User } from "../models/user.js";
import auth from "../middlewares/auth.js";
import admin from "../middlewares/admin.js";
import sendPushNotification from "../utils/pushNotifications.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
  const { message, targetUsersId, title } = req.body;

  targetUsersId.forEach(async (targetUserId) => {
    if (!mongoose.isValidObjectId(targetUserId)) return;

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) return;

    const { expoPushToken } = targetUser;
    sendPushNotificationTo([expoPushToken?.data], { message, title });
  });

  res.status(201).send();
});

router.post("/all", [auth, admin], async (req, res) => {
  const { message, title } = req.body;

  const tokens = (await User.find({}))
    .map((user) => user.expoPushToken?.data)
    .filter((token) => typeof token === "string");
  sendPushNotificationTo(tokens, { message, title });

  res.status(201).send();
});

export function sendPushNotificationTo(
  usersToken = [],
  { message, title, ...otherData }
) {
  usersToken.forEach(async (token) => {
    if (Expo.isExpoPushToken(token))
      await sendPushNotification(token, { message, title, ...otherData });
  });
}

export default router;
