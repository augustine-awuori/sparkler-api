import express from "express";

import { User } from "../models/user.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
    const userId = req.user._id;
    const { token } = req.body;

    const user = await User.findById(userId);
    if (!user)
        return res.status(404).send({ error: "User does not exist in the DB" });

    user.expoPushToken = token;
    await user.save();

    res.status(201).send({ message: "Expo push token saved successfully" });
});

export default router;
