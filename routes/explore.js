import express from "express";
import { OpenAI } from "openai";

import { Sparkle } from "../models/sparkle.js";

const router = express.Router();

router.get("/", async (_req, res) => {
    try {
        // Fetch limited sparkles (e.g., latest 20 for perf—add query params for more control)
        const sparkles = await Sparkle.find({})
            .sort({ createdAt: -1 }) // Assuming you have timestamps
            .limit(20)
            .lean(); // Faster: returns plain JS objects, no Mongoose overhead

        const apiKey = process.env.POE_API_KEY;
        if (!apiKey) {
            throw new Error("POE_API_KEY env var missing—check your secrets!");
        }

        const openai = new OpenAI({
            apiKey,
            baseURL: "https://api.poe.com/v1",
        });

        // Structured prompt: Send as string with instructions for consistent JSON output
        const sparkleData = JSON.stringify(sparkles, null, 2); // Pretty-print for readability
        const prompt = `Generate a structured "For You" Explore Page JSON from these sparkles (posts). Follow the exact schema: {
  "forYouEdition": {
    "date": "YYYY-MM-DD",
    "totalSparklesProcessed": ${sparkles.length},
    "themes": [ ... ],  // Group into 3-5 themes with items (headline, teaser, etc.)
    "relevantPeople": [ ... ],  // Extract unique actors (SU:userId), suggest 3-5
    "hook": "Engaging closer string"
  }
}. Use actor: "SU:userId" for authors. Make it witty & concise. Sparkles data: ${sparkleData}`;

        const response = await openai.chat.completions.create({
            model: "SparklerAI", // Or "Grok-4-Fast-Reasoning" if swapping
            messages: [
                {
                    role: "system",
                    content:
                        "You are a For You Page Curator. Output ONLY valid JSON—no extra text.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.3, // Low for consistent structure
            max_tokens: 2000, // Cap to avoid runaway costs
        });

        const content = response.choices[0].message.content;
        // Quick validation: Ensure it's JSON
        const parsed = JSON.parse(content);

        res.json(parsed); // Send the structured JSON directly
    } catch (err) {
        console.error("Router error:", err); // Log for debugging
        if (err.message.includes("JSON")) {
            return res
                .status(400)
                .json({ error: "Invalid response from API—check model/prompt." });
        }
        res.status(500).json({ error: err.message });
    }
});

export default router;
