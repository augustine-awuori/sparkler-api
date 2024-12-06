import express from "express";

import { getClient } from "../utils/func.js";

const router = express.Router();

router.get("/verified", async (_req, res) => {
    try {
        const client = getClient();
        const response = await client.feed("hashtags", "verified").get();

        response
            ? res.send(response.results)
            : res
                .status(500)
                .send({ error: "Error getting verified hashtags' response" });
    } catch (error) {
        res
            .status(500)
            .send({
                error: `Error executing fetch verified hashtags request: ${error}`,
            });
    }
});

router.get("/all", async (_req, res) => {
    try {
        const client = getClient();
        const response = await client.feed("hashtags", "general").get();

        response
            ? res.send(response.results)
            : res.status(500).send({ error: "Error getting all hashtags" });
    } catch (error) {
        res
            .status(500)
            .send({ error: `Error executing fetch all hashtags request: ${error}` });
    }
});


export default router;
