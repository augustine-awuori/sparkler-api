import type { Logger } from "../utils/logger.js";
import { sendMailBatch, type MailInput } from "./mail.js";

/**
 * Emails sent automatically when something happens to an account. They go out
 * in the background: a Resend outage or a slow send must never fail or delay
 * the request that triggered them.
 */

const SITE = "https://sparkler.website/";

export interface Recipient {
  email: string;
  name?: string;
}

const firstName = (name = ""): string => name.trim().split(/\s+/)[0] || "there";

export function welcomeMail({ email, name }: Recipient): MailInput {
  return {
    to: email,
    subject: `Welcome to Sparkler, ${firstName(name)}`,
    heading: `Welcome to Sparkler, ${firstName(name)}!`,
    preheader: "Your campus, all in one place. Here's how to get started.",
    message: [
      "We're glad you're here. Sparkler is where students share what's happening on campus, find each other and keep in touch.",
      "A few things to do first:\n• Add a photo and a short bio so people recognise you\n• Set your school and course to find classmates\n• Post something, even just hello",
      "See you inside.",
    ].join("\n\n"),
    cta: { label: "Open Sparkler", url: SITE },
  };
}

export function verifiedMail({ email, name }: Recipient): MailInput {
  return {
    to: email,
    subject: "You're verified on Sparkler",
    heading: `You're verified, ${firstName(name)}`,
    preheader: "Your profile now shows the verified badge.",
    message: [
      "Good news: your Sparkler account has been verified. Your profile now shows the verified badge, so people know it's really you.",
      "If the badge doesn't show yet, sign out and back in to refresh your profile.",
    ].join("\n\n"),
    cta: { label: "See your profile", url: SITE },
  };
}

export function accountDeletedMail({ email, name }: Recipient): MailInput {
  return {
    to: email,
    subject: "Your Sparkler account has been deleted",
    heading: "Your account has been deleted",
    message: [
      `Hi ${firstName(name)}, this confirms that your Sparkler account and profile have been deleted.`,
      "If you didn't do this, reply to this email and we'll look into it.",
      "You're welcome back any time: signing in again creates a new account.",
    ].join("\n\n"),
    footnote: "You're receiving this because your Sparkler account was deleted. This is the last email we'll send you.",
  };
}

/** Sends in the background. Never throws; failures are logged. */
export function sendInBackground(log: Logger, mails: readonly MailInput[]): void {
  if (!mails.length) return;

  sendMailBatch(mails)
    .then(({ failed }) => {
      if (failed) log.warn({ failed, total: mails.length }, "Some account emails were not sent");
    })
    .catch((err: unknown) => log.error({ err }, "Account email failed"));
}
