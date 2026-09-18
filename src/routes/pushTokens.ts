import { Router } from "express";

import { authedHandler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { PushToken } from "../models/pushToken.js";
import { sendPushNotificationTo } from "../utils/pushNotifications.js";

interface NotificationBody {
  message?: string;
  title?: string;
  [key: string]: unknown;
}

const router = Router();

router.post(
  "/",
  auth,
  authedHandler<Record<string, string>, { pushToken?: string }>(async (req, res) => {
    const { pushToken } = req.body;
    if (!pushToken) return res.status(400).send({ error: "Push token is required" });

    const userId = req.user.id;
    const token = await PushToken.findOne({ userId });
    if (!token) await new PushToken({ pushToken, userId }).save();
    else if (token.pushToken !== pushToken)
      await PushToken.findByIdAndUpdate(token._id, { pushToken });

    // Previously never answered on success, so every client request hung.
    res.send({ success: true });
  }),
);

router.post(
  "/send-to-many",
  auth,
  authedHandler<Record<string, string>, NotificationBody & { userIds?: unknown }>(
    async (req, res) => {
      const { userIds, message, title, ...other } = req.body;
      if (!userIds || !Array.isArray(userIds) || !message)
        return res.status(400).json({ error: "Missing user ID or message" });

      const tokens = await PushToken.find({ userId: { $in: userIds } });

      await sendPushNotificationTo(
        tokens.map((token) => token.pushToken),
        { message, title, ...other },
      );
      res.send({ success: true });
    },
  ),
);

router.post(
  "/send-to-all",
  auth,
  authedHandler<Record<string, string>, NotificationBody>(async (req, res) => {
    const { message, title, ...other } = req.body;
    if (!message) return res.status(400).json({ error: "Missing user ID or message" });

    // Everyone except the sender.
    const tokens = await PushToken.find({ userId: { $ne: req.user.id } });

    await sendPushNotificationTo(
      tokens.map((token) => token.pushToken),
      { message, title, ...other },
    );
    res.send({ success: true });
  }),
);

export default router;
