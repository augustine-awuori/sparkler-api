import express from "express";
import { OpenAI } from "openai";

import { Grao } from "../models/grao.js";

const router = express.Router();

router.post("/", async (req, res) => {
    try {
        const apiKey = process.env.POE_API_KEY;
        if (!apiKey) return res.status(500).send({ error: "POE API KEY not set" });

        const { prompt } = req.body;
        if (!prompt || typeof prompt !== "string")
            return res.status(400).send({ error: "Invalid prompt type" });

        const openai = new OpenAI({
            apiKey,
            baseURL: "https://api.poe.com/v1",
        });

        const response = await openai.chat.completions.create({
            model: "GraoAI",
            messages: [{ role: "user", content: prompt }],
        });

        const responseText = response.choices[0].message.content;
        Grao({ prompt, response: responseText }).save();
        res.send(responseText);
    } catch (error) {
        res
            .status(500)
            .send({ error: "An error occurred while processing your request" });
    }
});

export default router;
