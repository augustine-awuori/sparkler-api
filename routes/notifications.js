import express from "express";

import { getClient, getEATZone } from "../utils/func.js";
import { saveBug } from "./bugs.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
  const client = getClient();
  if (!client) {
    saveBug("Client is falsy, could not send a notification");
    return res.status(500).send({ error: `Error initializing a client` });
  }

  const time = getEATZone();

  const { actorId, userId, verb, data } = req.body;
  client.feed("notificaiton", actorId).addActivity({
    actor: `SU:${actorId}`,
    foreign_id: actorId + time,
    target: `notification:${userId}`,
    time,
    verb, data
  });
});

export default router;
