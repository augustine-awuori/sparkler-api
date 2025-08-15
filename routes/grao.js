import express from "express";
import { OpenAI } from 'openai';

const router = express.Router();

router.post('/', async (req, res) => {
    try {
        const apiKey = process.env.POE_API_KEY;
        if (!apiKey) return res.status(500).send({ error: 'POE API KEY not set' });

        const { prompt } = req.body;
        if (!prompt || typeof prompt !== 'string') return res.status(400).send({ error: 'Invalid prompt type' });

        const openai = new OpenAI({
            apiKey,
            baseURL: 'https://api.poe.com/v1'
        });

        const response = await openai.chat.completions.create({
            model: 'GraoAI',
            messages: [{ role: 'user', content: prompt }]
        });

        res.send(response.choices[0].message.content)

    } catch (error) {

    }

});

export default router;
