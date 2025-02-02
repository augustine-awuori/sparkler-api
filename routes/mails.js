import express from "express";

import { sendMail } from "../services/mail.js";
import { User } from "../models/user.js";
import admin from "../middlewares/admin.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/all", [auth, admin], async (req, res) => {
    const { subject, message } = req.body;

    const emails = (await User.find({})).map((user) => user.email);
    const { accepted } = await sendMail({ to: emails, message, subject });

    accepted
        ? res.send({ message: "Email sent" })
        : res.status(500).send({ error: "Something failed while sending email" });
});

router.post("/:email", [auth, admin], async (req, res) => {
    const { subject, message } = req.body;
    const { email } = req.params;

    const { accepted } = await sendMail({ to: email, message, subject });

    accepted
        ? res.send({ message: "Email sent" })
        : res.status(500).send({ error: "Something failed while sending email" });
});

router.post("/failed-login", [auth, admin], async (_req, res) => {
    const emails = (await User.find({}))
        .filter((user) => user.authCode)
        .map((user) => user.email);

    if (!emails.length)
        return res.status(201).send({ message: "No incomplete registrations" });

    const subject =
        "Reminder: Use Your Sparkler Auth Code & App Update Available";
    const message =
        "We noticed that you requested an authentication code but haven’t used it yet. To access your Sparkler account, please use the code sent in the previous email. If the code has expired or you no longer have it, you can request a new one. \n With Auth Code at Sparkler we're going passwordless, you don't need to remember it. \n Additionally, we have an update available on the Play Store with new features and improvements. \n Make sure to update your app for the best experience.";
    // const { accepted } = await sendMail({ to: emails, message, subject });

    // accepted
    //     ? res.send({ message: "Email sent" })
    //     : res.status(500).send({ error: "Something failed while sending email" });
    res.send(emails);
});

export default router;
