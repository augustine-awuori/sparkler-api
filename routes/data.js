import express from "express";

const router = express.Router();

router.get("/", async (_req, res) => {
    res.send({ token: process.env.APP_DATA });
});

export default router;
