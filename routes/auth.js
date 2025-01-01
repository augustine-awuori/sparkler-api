import express from "express";
import bcrypt from "bcrypt";
import Joi from "joi";

import { getAuthCode } from "../utils/func.js";
import { sendMail } from "../services/mail.js";
import { User } from "../models/user.js";
import validator from "../middlewares/validate.js";

const router = express.Router();

const validateDetails = (details) =>
    Joi.object({
        email: Joi.string().required(),
        password: Joi.string().min(6).required(),
    }).validate(details);

router.post("/", validator(validateDetails), async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "Email isn't registered." });
    const isValidPassword = await bcrypt.compare(password, user.password);

    return isValidPassword
        ? res.send(user.generateAuthToken())
        : res.status(400).send({ error: "Invalid username and/or password." });
});

router.post("/auth-code", async (req, res) => {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "Email isn't registered." });
    const authCode = getAuthCode();
    const salt = await bcrypt.genSalt(10);
    user.authCode = await bcrypt.hash(authCode, salt);
    await user.save();

    const { accepted } = await sendMail({
        message: `Your authentication code is: ${authCode} . It'll expire once you use it.`,
        subject: "Your Access Code",
        to: email,
    });

    accepted ?
        res.send({ message: "Code has been sent to the email provided" })
        : res.status(500).send({ error: 'Something failed while sending the auth code' });
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
    await user.save();
    res.send(user.generateAuthToken());
});

export default router;
