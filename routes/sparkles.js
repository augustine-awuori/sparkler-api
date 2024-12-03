import express from "express";
import * as stream from "getstream";

import auth from "../middlewares/auth.js";

const router = express.Router();

router.delete("/:sparkleId", auth, async (req, res) => {
    try {
        const { sparkleId } = req.params;

        const client = stream.connect(
            process.env.feedApiKey,
            process.env.feedSecretKey,
            process.env.streamAppId
        );

        const userFeed = await client.feed("user", req.user._id.toString());
        res.send(await userFeed?.removeActivity(sparkleId));
    } catch (error) {
        res.status(500).send({ error: "Error deleting a sparkle" });
    }
});

export default router;
