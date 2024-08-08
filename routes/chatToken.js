import { StreamChat } from "stream-chat";
import express from "express";

import userService from '../services/users.js';

const router = express.Router();

const serverClient = StreamChat.getInstance(
    process.env.chatApiKey,
    process.env.chatApiSecret
);

router.post("/", auth, async (req, res) => {
    const userId = req.user._id;

    const user = await userService.findById(userId);
    if (!user)
        return res
            .status(404)
            .send({ error: "You don't exist in the database. Sign Up" });

    let token = "";
    if (user.chatToken)
        token = user.chatToken;
    else {
        token = serverClient.createToken(userId);
        await userService.findByIdAndUpdate(userId, { chatToken: token });
    }

    res.send(token);
});

export default router;
