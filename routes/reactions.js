import express from "express";
import * as stream from "getstream";

import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/add", auth, async (req, res) => {
  try {
    const { actorId } = req.body;
    const userId = req.user._id.toString();
    const notifyActor = userId !== actorId;

    const reaction = await addReaction({
      ...req.body,
      targetFeeds: notifyActor ? getTargetFeeds(actorId) : [],
      userId,
    });

    reaction.ok
      ? res.send(reaction.data)
      : res.status(500).send({
          error: `Couldn't add a reaction ${reaction.data}`,
        });
  } catch (error) {
    res
      .status(500)
      .send({ error: `The whole 'add reaction' operation failed: ${error}` });
  }
});

router.post("/toggle", auth, async (req, res) => {
  try {
    const userId = req.user._id.toString();
    const { done, actorId, kind, sparkleId } = req.body;

    const client = getClient();
    if (!client)
      return res.status(500).send({ error: "Client couldn't be initialized" });

    const hasBeenDone = typeof done === "string" ? done === "true" : done;
    if (hasBeenDone) {
      const response = await client.reactions.filter({
        activity_id: sparkleId,
        kind,
        user_id: userId,
      });

      if (response.results.length === 0)
        return res
          .status(404)
          .send({ error: "Reaction not found for the activity" });

      const reactionId = response.results[0].id;
      await client.reactions.delete(reactionId);

      res.send(response);
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

function getTargetFeeds(actorId) {
  return [`notification:${actorId}`];
}

function getClient() {
  return stream.connect(
    process.env.feedApiKey,
    process.env.feedSecretKey,
    process.env.streamAppId
  );
}

async function addReaction({
  kind,
  sparkleId,
  actorId,
  targetFeeds,
  userId,
  data = {},
}) {
  try {
    const client = getClient();
    if (!client) return { ok: false, data: "Client not initialized" };

    const resData = await client.reactions.add(
      kind,
      sparkleId,
      { id: actorId, ...data },
      { targetFeeds, userId }
    );
    return { ok: true, data: resData };
  } catch (error) {
    return { ok: false, data: error };
  }
}

export default router;
