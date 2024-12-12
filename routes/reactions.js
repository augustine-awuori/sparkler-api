import express from "express";
import * as stream from "getstream";

import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/add", auth, async (req, res) => {
  try {
    const { actorId, sparkleId, kind } = req.body;
    const userId = req.user._id.toString();
    const notifyActor = userId !== actorId;
    const targetFeeds = notifyActor ? getTargetFeeds(actorId) : [];

    const { data, ok } = await addReaction({
      actorId,
      kind,
      sparkleId,
      targetFeeds,
      userId,
    });
    ok ? res.send(data) : res.status(500).send({ error: data });
  } catch (error) {
    res.status(500).send({ error });
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
      const targetFeeds = notifyActor ? getTargetFeeds(actorId) : [];

      const { data, ok } = await addReaction({
        actorId,
        kind,
        sparkleId,
        targetFeeds,
        userId,
      });
      ok ? res.send(data) : res.status(500).send({ error: data });
    }
  } catch (error) {
    res.status(500).send({ error });
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

async function addReaction({ kind, sparkleId, actorId, targetFeeds, userId }) {
  try {
    const client = getClient();
    if (!client) return { ok: false, data: "Client not initialized" };

    const data = await client.reactions.add(
      kind,
      sparkleId,
      { id: actorId },
      { targetFeeds, userId }
    );
    return { ok: true, data };
  } catch (error) {
    return { ok: false, data: error };
  }
}

export default router;
