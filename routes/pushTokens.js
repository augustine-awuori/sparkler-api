import express from "express";

import { PushToken } from "../models/pushToken.js";
import { sendPushNotificationTo } from "../utils/pushNotifications.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
  try {
    const { pushToken } = req.body;
    if (!pushToken)
      return res.status(400).send({ error: "Push token is required" });

    const userId = req.user.id;
    let token = await PushToken.findOne({ userId });
    if (!token) await new PushToken({ pushToken, userId }).save();
    else if (token.pushToken !== pushToken)
      await PushToken.findByIdAndUpdate(token._id, { pushToken });
  } catch (error) {
    console.error(`Error registering a push token: ${error}`);
    res.status(500).send({ error: "Error registering/updating a push token" });
  }
});

router.post("/send-to-many", auth, async (req, res) => {
  try {
    const { userIds, message, title, ...other } = req.body;
    if (!userIds || !Array.isArray(userIds) || !message)
      return res.status(400).json({ error: "Missing user ID or message" });

    const tokens = await PushToken.find({ userId: { $in: userIds } });

    await sendPushNotificationTo(
      tokens.map((token) => token.pushToken),
      { message, title, ...other },
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
