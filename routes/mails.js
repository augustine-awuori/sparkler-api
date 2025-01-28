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

router.post('/:email', [auth, admin], async (req, res) => {
    const { subject, message } = req.body;

    const email = (await User.find({ email: req.params.email })).map((user) => user.email);
    const { accepted } = await sendMail({ to: email, message, subject });

    accepted
        ? res.send({ message: "Email sent" })
        : res.status(500).send({ error: "Something failed while sending email" });
})

export default router;
