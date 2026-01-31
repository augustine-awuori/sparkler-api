import express from "express";
import Expo from "expo-server-sdk";

import { PushToken } from "../models/pushToken.js";
import { sendPushNotificationTo } from "./expoPushNotifications.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
  try {
    const { pushToken } = req.body;
    const userId = req?.user?.id;

    if (!userId || !pushToken)
      return res.status(400).json({ error: "Missing user ID or token" });

    try {
      if (!Expo.isExpoPushToken(pushToken))
        return res.status(400).send({ error: "Invalid push token" });
    } catch (error) {
      console.error("Error vlidating a push token " + error);
    }

    const found = await PushToken.findOne({ userId });
    found
      ? res.send(await PushToken.findByIdAndUpdate(found._id, { pushToken }))
      : res.send(await new PushToken({ userId, pushToken }).save());
  } catch (error) {
    console.error(`Couldn't save user's push token ${error}`);
    res.status(500).json({
      error: "Server error. Couldn't register or update user push token",
    });
  }
});

router.post("/send-to-one", auth, async (req, res) => {
  try {
    const { userId, message, title, ...others } = req.body;
    if (!userId || !message)
      return res.status(400).json({ error: "Missing user ID or message" });

    const token = await PushToken.findOne({ userId });
    if (!token)
      return res.status(404).json({ error: "Push token not found for user" });

    sendPushNotificationTo([token.pushToken], { message, title, ...others });
    res.send({ success: true });
  } catch (error) {
    console.error(`Couldn't fetch user's push tokens ${error}`);
    res
      .status(500)
      .json({ error: "Server error. Couldn't fetch user push tokens" });
  }
});

router.post("/send-to-many", auth, async (req, res) => {
  try {
    const { userIds, message, title } = req.body;
    if (!userIds || !Array.isArray(userIds) || !message)
      return res.status(400).json({ error: "Missing user ID or message" });

    const tokens = await PushToken.find({ userId: { $in: userIds } });

    sendPushNotificationTo(
      tokens.map((token) => token.pushToken),
      { message, title },
    );
    res.send({ success: true });
  } catch (error) {
    console.error(`Couldn't send users push notifications ${error}`);
    res
      .status(500)
      .json({ error: "Server error. Couldn't send users push notifications" });
  }
});

export default router;
