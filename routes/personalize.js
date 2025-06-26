import express from "express";

import { getClient } from "../utils/func.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.get("/feed", auth, async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      console.error("Error initializing client for personalized feed");
      return res.status(500).send({ error: "Error initializing client" });
    }

    const params = { user_id: req.user._id, feed_slug: "timeline" };
    const result = await client.personalization.get(
      "personalized_feed",
      params
    );
    res.send(result.results);
  } catch (error) {
    console.error(`Error fetching personalized feed: ${error}`);
    res.status(500).send({ error: "Error fetching personalized feed" });
  }
});

router.get("/follow_recommendations", auth, async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      console.error("Error initializing client for follow recommendations");
      return res.status(500).send({ error: "Error initializing client" });
    }

    const params = { user_id: req.user._id, feed_slug: "timeline" };
    const { results } = await client.personalization.get(
      "follow_recommendations",
      params
    );
    res.send(results);
  } catch (error) {
    console.error(`Error fetching follow recommendations: ${error}`);
    res.status(500).send({ error: "Error fetching follow recommendations" });
  }
});

router.get("/discovery_feed", auth, async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      console.error("Error initializing client for follow recommendations");
      return res.status(500).send({ error: "Error initializing client" });
    }

    const params = { user_id: req.user._id, feed_slug: "timeline" };
    const { results } = await client.personalization.get(
      "discovery_feed",
      params
    );
    res.send(results);
  } catch (error) {
    console.error(`Error fetching discovery feed: ${error}`);
    res.status(500).send({ error: "Error fetching discovery feed" });
  }
});

export default router;
