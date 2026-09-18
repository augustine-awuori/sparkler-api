import { Router } from "express";

import { BadRequestError } from "../domain/errors.js";
import { handler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { requireAdmin } from "../http/middlewares/requireAdmin.js";
import { Sparkler } from "../models/sparkler.js";
import { sendBulkMail, sendMail } from "../services/mail.js";
import { renderAnnouncement, type AnnouncementContent } from "../services/mailTemplate.js";

/**
 * Admin-only announcements about the app. Every route takes the same body:
 * { subject, message, heading?, preheader?, ctaLabel?, ctaUrl? }. `message` is
 * plain text — blank lines start a new paragraph. Try it with POST /preview
 * before sending to everyone.
 */

interface MailBody {
  subject?: unknown;
  message?: unknown;
  heading?: unknown;
  preheader?: unknown;
  ctaLabel?: unknown;
  ctaUrl?: unknown;
}

const optionalText = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** Validates the body into template content, or throws a 400. */
function parseMail(body: MailBody | undefined): { subject: string; content: AnnouncementContent } {
  const subject = optionalText(body?.subject);
  const message = optionalText(body?.message);
  if (!subject || !message) throw new BadRequestError("Subject and message are required");

  const heading = optionalText(body?.heading);
  const preheader = optionalText(body?.preheader);
  const ctaLabel = optionalText(body?.ctaLabel);
  const ctaUrl = optionalText(body?.ctaUrl);

  if (Boolean(ctaLabel) !== Boolean(ctaUrl))
    throw new BadRequestError("ctaLabel and ctaUrl must be provided together");
  if (ctaUrl && !isHttpsUrl(ctaUrl)) throw new BadRequestError("ctaUrl must be an https:// URL");

  return {
    subject,
    content: {
      message,
      ...(heading && { heading }),
      ...(preheader && { preheader }),
      ...(ctaLabel && ctaUrl && { cta: { label: ctaLabel, url: ctaUrl } }),
    },
  };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

const router = Router();

// Renders the email without sending it, so an announcement can be checked in a
// browser before it goes to every user.
router.post(
  "/preview",
  auth,
  requireAdmin,
  handler<Record<string, string>, MailBody>((req, res) => {
    const { content } = parseMail(req.body);

    res.type("html").send(renderAnnouncement(content).html);
  }),
);

router.post(
  "/all",
  auth,
  requireAdmin,
  handler<Record<string, string>, MailBody>(async (req, res) => {
    const { subject, content } = parseMail(req.body);

    const emails = (await Sparkler.find({}, { email: 1 }).lean())
      .map((user) => user.email)
      .filter(Boolean);

    const { sent, failed } = await sendBulkMail(emails, subject, content);

    sent
      ? res.send({ message: "Email sent", sent, failed })
      : res.status(500).send({ error: "Something failed while sending email", sent, failed });
  }),
);

router.post(
  "/:email",
  auth,
  requireAdmin,
  handler<{ email: string }, MailBody>(async (req, res) => {
    const { subject, content } = parseMail(req.body);

    const { data, error } = await sendMail({ to: req.params.email, subject, ...content });

    data
      ? res.send({ message: "Email sent" })
      : res.status(500).send({ error: error?.message || "Something failed while sending email" });
  }),
);

export default router;
