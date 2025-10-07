import express from "express";
import { OpenAI } from "openai";

import { Sparkle } from "../models/sparkle.js";

const router = express.Router();

router.get("/", async (_req, res) => {
    try {
        const sparkles = await Sparkle.find({}).sort({ createdAt: -1 }).lean();

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
    "relevantPeople": [ ... ],  // Extract unique actors (SU:userId),
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

router.get("/themeSparkles", async (req, res) => {
    const { headline, teaser } = req.query; // Use query params for GET route

    if (!headline && !teaser) return res.json([]);

    try {
        const sparkles = await Sparkle.find({}).sort({ createdAt: -1 }).lean();

        const apiKey = process.env.POE_API_KEY;
        if (!apiKey)
            throw new Error("POE_API_KEY env var missing—check your secrets!");

        const openai = new OpenAI({
            apiKey,
            baseURL: "https://api.poe.com/v1",
        });

        const sparkleData = JSON.stringify(sparkles, null, 2);
        const prompt = `Given the theme headline: "${headline}" and teaser: "${teaser}", analyze the following sparkles and output STRICTLY a JSON array of strings containing ONLY the IDs of the sparkles that highly relate to this theme.Use the 'id' field from each sparkle.No other text or explanation—just the array like["id1", "id2", ...]. Sparkles data: ${sparkleData} `;

        const response = await openai.chat.completions.create({
            model: "SparklerAI", // Or "Grok-4-Fast-Reasoning" if swapping
            messages: [
                {
                    role: "system",
                    content:
                        "You are a theme relevance analyzer. Output ONLY a valid JSON array of strings—no extra text, no objects.",
                },
                { role: "user", content: prompt },
            ],
            temperature: 0.1, // Very low for precise selection
            max_tokens: 500, // Sufficient for array of IDs
        });

        const content = response.choices[0].message.content;
        // Quick validation: Ensure it's a JSON array
        const parsed = JSON.parse(content);
        if (
            !Array.isArray(parsed) ||
            !parsed.every((id) => typeof id === "string")
        ) {
            throw new Error("Invalid array response from API");
        }

        res.json(parsed); // Send the array of IDs directly
    } catch (err) {
        console.error("Theme Sparkles route error:", err);
        if (err.message.includes("JSON") || err.message.includes("array")) {
            return res
                .status(400)
                .json({ error: "Invalid response from API—check model/prompt." });
        }
        res.status(500).json({ error: err.message });
    }
});

export default router;
