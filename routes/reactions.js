import express from "express";

import {
  addChildReaction,
  addReaction,
  getClient,
  getTargetFeeds,
  getUserReactions,
  removeChildReaction,
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

router.post("/addChild", auth, async (req, res) => {
  try {
    const { actorId, kind, parentId, data } = req.body;
    const userId = req.user._id.toString();
    const notifyActor = userId !== actorId;

    const response = await addChildReaction({
      targetFeeds: notifyActor ? getTargetFeeds(actorId) : [],
      userId,
      kind,
      parentId,
      data,
    });

    response.ok
      ? res.send(response.data)
      : res.status(500).send({
          error: `Couldn't add a reaction ${response.data}`,
        });
  } catch (error) {
    res
      .status(500)
      .send({ error: `The whole 'add reaction' operation failed: ${error}` });
  }
});

router.post("/removeChild", auth, async (req, res) => {
  const { reactionId } = req.body;

  const { ok } = await removeChildReaction(reactionId);

  ok
    ? res.status(201).send()
    : res.status(500).send({ error: "Something failed" });
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
      const defaultTargetFeeds = notifyActor ? getTargetFeeds(actorId) : [];
      const targetFeeds =
        kind === "resparkle"
          ? [`user:${userId}`, ...defaultTargetFeeds]
          : defaultTargetFeeds;

      const { data, ok } = await addReaction({
        ...req.body,
        targetFeeds,
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

router.post("/", async (req, res) => {
  const client = getClient();
  if (!client)
    return res.status(500).send({ error: "Could not initialized client" });

  const { reactionsId } = req.body;
  const reactions = [];

  (reactionsId || []).forEach(async (id) => {
    const reaction = await client.reactions.filter({
      reaction_id: id,
      with_activity_data: true,
      with_own_children: true,
    });

    if (reaction) reactions.push(reaction);
  });

  res.send(reactions);
});

router.get("/:kind/:activityId", async (req, res) => {
  const { activityId, kind } = req.params;

  const client = getClient();
  if (!client)
    return res.status(500).send({ error: "Could not initialized client" });

  const reactionResponse = await client.reactions.filter({
    kind,
    activity_id: activityId,
    with_activity_data: true,
    with_own_children: true,
  });

  reactionResponse
    ? res.send(reactionResponse)
    : res.status(500).send({ error: "Could not get sparkle reactions" });
});

router.get("/:kind", auth, async (req, res) => {
  const userId = req.user._id.toString();
  const { kind } = req.params;

  const { data, ok } = await getUserReactions({ kind, userId });
  if (!ok) return res.status(500).send({ error: data });

  ok ? res.send(data) : res.status(500).send({ error: "App error" });
});

router.get("/profile/:userId/:kind/", async (req, res) => {
  const { kind, userId } = req.params;

  const { data, ok } = await getUserReactions({ kind, userId });
  if (!ok) return res.status(500).send({ error: data });

  res.send(data.results);
});

export default router;
