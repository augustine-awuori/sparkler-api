import express from "express";

import { UserPresence } from "../models/UserPresence.js";
import { DailySession } from "../models/DailySession.js";

const router = express.Router();

router.post("/presence", async (req, res) => {
  try {
    const { userId, online, lastActive } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

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
