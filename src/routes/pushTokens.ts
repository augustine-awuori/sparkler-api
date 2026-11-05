import { Router } from "express";

import { BadRequestError } from "../domain/errors.js";
import { authedHandler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { requireAdmin } from "../http/middlewares/requireAdmin.js";
import { PushToken } from "../models/pushToken.js";
import { pushTokensOf, reachableRecipients } from "../services/pushAudience.js";
import { announceSparkle } from "../services/sparkleAnnouncement.js";
import { sendPushNotificationTo } from "../utils/pushNotifications.js";

interface NotificationBody {
  message?: string;
  title?: string;
  data?: unknown;
}

/** Expo takes 100 messages per call, and both clients already send in this size. */
const MAX_RECIPIENTS_PER_REQUEST = 100;

// Only these reach Expo. Spreading the whole body let a caller pass `to` and
// redirect the notification to arbitrary devices.
function payloadOf({ message = "", title, data }: NotificationBody) {
  return {
    message,
    ...(typeof title === "string" && { title }),
    ...(data !== null && typeof data === "object" && { data }),
  };
}

function requiredPushToken(value: unknown): string {
  // A string check, not just presence: an object here would become a Mongo operator.
  if (typeof value !== "string" || !value) throw new BadRequestError("Push token is required");
  return value;
}

const router = Router();

router.post(
  "/",
  auth,
  authedHandler<Record<string, string>, { pushToken?: unknown }>(async (req, res) => {
    const pushToken = requiredPushToken(req.body.pushToken);

    await PushToken.findOneAndUpdate(
      { pushToken },
      { pushToken, userId: req.user.id },
      { upsert: true },
    );

    // Previously never answered on success, so every client request hung.
    res.send({ success: true });
  }),
);

router.delete(
  "/",
  auth,
  authedHandler<Record<string, string>, { pushToken?: unknown }>(async (req, res) => {
    const pushToken = requiredPushToken(req.body?.pushToken);
    await PushToken.deleteOne({ pushToken, userId: req.user.id });
    res.send({ success: true });
  }),
);

router.post(
  "/sparkle",
  auth,
  authedHandler<Record<string, string>, { activityId?: unknown }>(async (req, res) => {
    const { activityId } = req.body;
    if (typeof activityId !== "string" || !activityId) {
      throw new BadRequestError("Activity id is required");
    }
    res.send({ outcome: await announceSparkle(req.user.id, activityId) });
  }),
);

router.post(
  "/send-to-many",
  auth,
  authedHandler<Record<string, string>, NotificationBody & { userIds?: unknown }>(
    async (req, res) => {
      const { userIds, message } = req.body;
      if (!userIds || !Array.isArray(userIds) || !message)
        return res.status(400).json({ error: "Missing user ID or message" });
      if (userIds.length > MAX_RECIPIENTS_PER_REQUEST)
        return res.status(400).json({ error: "Too many recipients" });

      const recipients = await reachableRecipients(req.user.id, userIds);
      await sendPushNotificationTo(await pushTokensOf(recipients), payloadOf(req.body));
      res.send({ success: true });
    },
  ),
);

router.post(
  "/send-to-all",
  auth,
  requireAdmin,
  authedHandler<Record<string, string>, NotificationBody>(async (req, res) => {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: "Missing user ID or message" });

    // Everyone except the sender.
    const tokens = await PushToken.find({ userId: { $ne: req.user.id } });

    await sendPushNotificationTo(
      tokens.map((token) => token.pushToken),
      payloadOf(req.body),
    );
    res.send({ success: true });
  }),
);

export default router;
