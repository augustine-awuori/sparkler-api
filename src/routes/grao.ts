import { Router } from "express";
import { OpenAI } from "openai";

import { config } from "../config/index.js";
import { handler } from "../http/handler.js";
import { Grao } from "../models/grao.js";

let openai: OpenAI | undefined;

function client(): OpenAI {
  openai ??= new OpenAI({ apiKey: config().poeApiKey, baseURL: "https://api.poe.com/v1" });
  return openai;
}

const router = Router();

router.post(
  "/",
  handler<Record<string, string>, { prompt?: unknown }>(async (req, res) => {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string")
      return res.status(400).send({ error: "Invalid prompt type" });

    try {
      const response = await client().chat.completions.create({
        model: "GraoAI",
        messages: [{ role: "user", content: prompt }],
      });

      const responseText = response.choices[0]?.message.content ?? "";

      // Not awaited: the caller should not wait on the history write. It must
      // still be caught, as an unhandled rejection is fatal to the process.
      new Grao({ prompt, response: responseText })
        .save()
        .catch((err: unknown) => req.log.error({ err }, "Error saving a Grao exchange"));

      res.send(responseText);
    } catch (err) {
      req.log.error({ err }, "Error calling GraoAI");
      res.status(500).send({ error: "An error occurred while processing your request" });
    }
  }),
);

export default router;
