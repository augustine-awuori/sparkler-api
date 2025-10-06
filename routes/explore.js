import express from "express";
import { OpenAI } from "openai";

import { Sparkle } from "../models/sparkle.js";

const router = express.Router();

router.get("/", async (_req, res) => {
    try {
        const sparkles = await Sparkle.find({});

        const apiKey = process.env.POE_API_KEY;
        const openai = new OpenAI({
            apiKey,
            baseURL: "https://api.poe.com/v1",
        });
        const response = await openai.chat.completions.create({
            model: "SparklerAI",
            messages: [{ role: "user", content: JSON.parse(sparkles) }],
        });

        res.send(response.choices[0].message.content);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
