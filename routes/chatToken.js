import { StreamChat } from "stream-chat";
import express from "express";

import auth from "../middlewares/auth.js";
import userService from '../services/users.js';

const router = express.Router();

const serverClient = StreamChat.getInstance(
    process.env.chatApiKey,
    process.env.chatApiSecret
);

router.post("/", auth, async (req, res) => {
    const userId = req.user._id;

    let user = await userService.findById(userId);
    if (!user)
        return res
            .status(404)
            .send({ error: "You don't exist in the database. Sign Up" });

    let chatToken = "";
    if (user.chatToken)
        chatToken = user.chatToken;
    else {
        chatToken = serverClient.createToken(userId)
        await userService.findByIdAndUpdate(userId, { chatToken }, { new: true });
        user = await userService.findById(userId);
    }

    res
        .header("x-auth-token", user.generateAuthToken())
        .send(chatToken);
});

export default router;
