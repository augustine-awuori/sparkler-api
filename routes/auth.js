import { StreamChat } from "stream-chat";
import express from 'express';
import bcrypt from "bcrypt";

import { User, validateUser } from "../models/user.js";
import validator from "../middlewares/validate.js";

const serverClient = StreamChat.getInstance(
    process.env.chatApiKey,
    process.env.chatApiSecret
);

const router = express.Router();

router.post("/", validator(validateUser), async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "Email isn't registered." });

    if (!user.chatToken) {
        user.chatToken = serverClient.createToken(user._id);
        await user.save();
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    return (isValidPassword)
        ? res.send(user.generateAuthToken())
        : res.status(400).send({ error: "Invalid username and/or password." });
});

export default router;