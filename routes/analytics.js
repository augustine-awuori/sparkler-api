import express from "express";

import { UserPresence } from "../models/userPresence.js";
import { DailySession } from "../models/dailySession.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/post", async (req, res) => {
  try {
    const { userId, type = "text" } = req.body;

    if (!userId) return res.status(400).json({ error: "userId required" });

    const today = new Date().toISOString().split("T")[0];

    const update = {
      $inc: {
        postCount: 1,
        [`postTypes.${type}`]: 1,
      },
    };

    const postRecord = await DailyPost.findOneAndUpdate(
      { userId, date: today },
      update,
      { upsert: true, new: true },
    );

    res.status(200).json({ success: true, data: postRecord });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to record post" });
  }
});

router.post("/engagement", auth, async (req, res) => {
  try {
    const { action, targetId, targetType, metadata = {} } = req.body;
    const userId = req.user.id;

    if (!userId || !action)
      return res.status(400).json({ error: "userId and action required" });

    const today = new Date().toISOString().split("T")[0];

    const engagement = await Engagement.create({
      userId,
      action,
      targetId,
      targetType,
      date: today,
      metadata,
    });

    res.status(201).json({ success: true, data: engagement });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to record engagement" });
  }
});

router.post("/presence", auth, async (req, res) => {
  try {
    const { online, lastActive } = req.body;
    const userId = req.user.id;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MMr-DD

    const presence = await UserPresence.findOneAndUpdate(
      { userId, date: today },
      {
        $set: {
          lastActive: lastActive ? new Date(lastActive) : new Date(),
          online: Boolean(online),
          updatedAt: new Date(),
        },
        $inc: { onlineTransitions: 1 },
      },
      { upsert: true, new: true, runValidators: true },
    );

    res.status(200).json({
      success: true,
      data: presence,
    });
  } catch (error) {
    console.error("Presence update error:", error);
    res.status(500).json({ error: "Failed to update presence" });
  }
});

router.post("/session", async (req, res) => {
  try {
    const { userId, durationMs } = req.body;

    if (!userId || typeof durationMs !== "number") {
      return res
        .status(400)
        .json({ error: "userId and durationMs (number) are required" });
    }

    const today = new Date().toISOString().split("T")[0];

    const session = await DailySession.findOneAndUpdate(
      { userId, date: today },
      {
        $inc: {
          totalTimeMs: durationMs,
          sessionCount: 1,
        },
      },
      { upsert: true, new: true, runValidators: true },
    );

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    console.error("Session update error:", error);
    res.status(500).json({ error: "Failed to update session" });
  }
});

export default router;
