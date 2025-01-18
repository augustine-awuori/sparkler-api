import express from "express";
import bcrypt from "bcrypt";
import Joi from "joi";
import { StreamChat } from "stream-chat";

import { findUniqueUsername } from "../services/users.js";
import { getAuthCode } from "../utils/func.js";
import { sendMail } from "../services/mail.js";
import { User } from "../models/user.js";
import validator from "../middlewares/validate.js";

const serverClient = StreamChat.getInstance(
    process.env.chatApiKey,
    process.env.chatApiSecret
);

const router = express.Router();

const validateDetails = (details) =>
    Joi.object({
        authCode: Joi.number().min(4).required(),
        email: Joi.string().required(),
    }).validate(details);

router.post("/", validator(validateDetails), async (req, res) => {
    const { email, authCode } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "Email isn't registered." });
    const isValidAuthCode = await bcrypt.compare(authCode, user.authCode);

    if (!isValidAuthCode)
        return res
            .status(400)
            .send({ error: "Invalid username and/or auth code." });

    user.authCode = "";
    await user.save();
    res.send(user.generateAuthToken());
});

router.post("/code", async (req, res) => {
    const { email } = req.body;

    let user = await User.findOne({ email });
    const authCode = getAuthCode();
    const salt = await bcrypt.genSalt(10);
    const hashedAuthCode = await bcrypt.hash(authCode.toString(), salt);

    if (!user) {
        const name = "Unknown";
        const username = await findUniqueUsername(name);
        user = new User({ email, name, username, invalid: true, });
        const token = serverClient.createToken(user._id.toString());
        user.feedToken = token;
        user.chatToken = token;
    }
    user.authCode = hashedAuthCode;
    await user.save();

    const { accepted } = await sendMail({
        message: `Your authentication code is: ${authCode} . It'll expire once you use it.`,
        subject: "Your Access Code",
        to: email,
    });

    accepted
        ? res.send({ message: "Code has been sent to the email provided" })
        : res
            .status(500)
            .send({ error: "Something failed while sending the auth code" });
});

router.post("/verify-auth-code", async (req, res) => {
    const { email, authCode } = req.body;
    if (!authCode)
        return res.status(400).send({ error: "Auth code not provided" });

    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "Email isn't registered." });

    const isValidCode = await bcrypt.compare(authCode, user.authCode);

    if (!isValidCode)
        res
            .status(400)
            .send({ error: "Invalid username and/or authentication code." });

    user.authCode = "";
    user.invalid = false;
    await user.save();
    res.send(user.generateAuthToken());
});

export default router;
