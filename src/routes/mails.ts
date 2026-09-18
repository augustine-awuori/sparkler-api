import { Router } from "express";

import { handler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { requireAdmin } from "../http/middlewares/requireAdmin.js";
import { Sparkler } from "../models/sparkler.js";
import { sendMail } from "../services/mail.js";

interface MailBody {
  subject?: string;
  message?: string;
}

const INCOMPLETE_SUBJECT = "Reminder: Use Your Sparkler Auth Code & App Update Available";
const INCOMPLETE_MESSAGE = `
We noticed that you requested an authentication code but haven’t used it yet.
To access your Sparkler account, please use the code sent in the previous email.
If the code has expired or you no longer have it, you can request a new one.

With Auth Code at Sparkler, we're going passwordless—you don't need to remember it.

Additionally, we have an update available on the Play Store with new features and improvements.
Make sure to update your app for the best experience.
`;

const router = Router();

router.post(
  "/all",
  auth,
  requireAdmin,
  handler<Record<string, string>, MailBody>(async (req, res) => {
    const { subject, message } = req.body;
    if (!subject || !message)
      return res.status(400).send({ error: "Subject and message are required" });

    const emails = (await Sparkler.find({})).map((user) => user.email);
    const { data, error } = await sendMail({ to: emails, message, subject });

    data
      ? res.send({ message: "Email sent" })
      : res.status(500).send({ error: error || "Something failed while sending email" });
  }),
);

router.post(
  "/incomplete",
  auth,
  requireAdmin,
  handler(async (_req, res) => {
    const emails = (await Sparkler.find({}))
      .filter((user) => user.authCode)
      .map((user) => user.email);

    if (!emails.length) return res.status(201).send({ message: "No incomplete registrations" });

    const { data } = await sendMail({
      to: emails,
      message: INCOMPLETE_MESSAGE,
      subject: INCOMPLETE_SUBJECT,
    });

    data
      ? res.send({ message: "Email sent" })
      : res.status(500).send({ error: "Something failed while sending email" });
  }),
);

router.post(
  "/:email",
  auth,
  requireAdmin,
  handler<{ email: string }, MailBody>(async (req, res) => {
    const { subject, message } = req.body;
    if (!subject || !message)
      return res.status(400).send({ error: "Subject and message are required" });

    const { data } = await sendMail({ to: req.params.email, message, subject });

    data
      ? res.send({ message: "Email sent" })
      : res.status(500).send({ error: "Something failed while sending email" });
  }),
);

export default router;
