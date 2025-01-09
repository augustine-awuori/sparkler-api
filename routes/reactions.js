import express from "express";

import {
  addReaction,
  getClient,
  getTargetFeeds,
  getUserReactions,
  removeReaction,
} from "../utils/func.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/add", auth, async (req, res) => {
  try {
    const { actorId } = req.body;
    const userId = req.user._id.toString();
    const notifyActor = userId !== actorId;

    const { data, ok } = await addReaction({
      ...req.body,
      targetFeeds: notifyActor ? getTargetFeeds(actorId) : [],
      userId,
    });

    ok
      ? res.send(data)
      : res.status(500).send({
        error: `Couldn't add a reaction ${data}`,
      });
  } catch (error) {
    res
      .status(500)
      .send({ error: `The whole 'add reaction' operation failed: ${error}` });
  }
});

router.post("/remove", auth, async (req, res) => {
  const userId = req.user._id.toString();
  const { kind, sparkleId } = req.body;

  const { data, ok } = await removeReaction({ kind, sparkleId, userId });

  ok
    ? res.send(data)
    : res.status(500).send({ error: data || "Something failed" });
});

router.post("/toggle", auth, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { done, actorId, kind, sparkleId } = req.body;

    const hasBeenReacted = typeof done === "string" ? done === "true" : done;
    if (hasBeenReacted) {
      const { data, ok } = await removeReaction({ kind, sparkleId, userId });

      ok
        ? res.send(data)
        : res.status(500).send({ error: data || "Something failed" });
    } else {
      const notifyActor = userId !== actorId && !done;

      const { data, ok } = await addReaction({
        ...req.body,
        targetFeeds: notifyActor ? getTargetFeeds(actorId) : [],
        userId,
      });

      ok
        ? res.send(data)
        : res.status(500).send({ error: `Error toggling reaction: ${data}` });
    }
  } catch (error) {
    res.status(500).send({
      error: `The whole 'toggle reaction' operation failed: ${error}`,
    });
  }
});

router.get("/:kind", auth, async (req, res) => {
  const userId = req.user._id.toString();
  const { kind } = req.params;

  const { data, ok } = await getUserReactions({ kind, userId });
  if (!ok) return res.status(500).send({ error: data });

  const client = getClient();
  if (!client) return res.status(500).send({ error: 'App error' });

  const sparkles = await client.getActivities({
    ids: [(data?.results || []).forEach((reaction) => reaction.activity_id)],
    enrich: true,
    ownReactions: true,
    reactions: true,
    withOwnChildren: true,
    withOwnReactions: true,
    withRecentReactions: true,
    withReactionCounts: true,
    withUserId: true,
  });
  res.send(sparkles);
});

export default router;
