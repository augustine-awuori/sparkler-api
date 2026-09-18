import { Resend } from "resend";

import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";
import { renderAnnouncement, type AnnouncementContent } from "./mailTemplate.js";

const FROM = "Sparkler <hello@sparkler.website>";
/** Resend's per-request limit for batch sends. */
const BATCH_SIZE = 100;

let resend: Resend | undefined;

function client(): Resend {
  resend ??= new Resend(config().resendApiKey);
  return resend;
}

export interface MailInput extends AnnouncementContent {
  to: string;
  subject: string;
}

/** One announcement to one recipient. Returns Resend's `{ data, error }`. */
export async function sendMail({ to, subject, ...content }: MailInput) {
  const { html, text } = renderAnnouncement(content);

  return await client().emails.send({ from: FROM, to, subject, html, text });
}

export interface BulkMailResult {
  sent: number;
  failed: number;
}

/**
 * Many emails, each to ONE recipient and each with its own content, through
 * Resend's batch API. A failed batch is logged and counted; the rest still go
 * out.
 */
export async function sendMailBatch(mails: readonly MailInput[]): Promise<BulkMailResult> {
  const result: BulkMailResult = { sent: 0, failed: 0 };

  for (let i = 0; i < mails.length; i += BATCH_SIZE) {
    const batch = mails.slice(i, i + BATCH_SIZE);

    try {
      const { error } = await client().batch.send(
        batch.map(({ to, subject, ...content }) => ({
          from: FROM,
          to,
          subject,
          ...renderAnnouncement(content),
        })),
      );
      if (error) throw new Error(error.message);
      result.sent += batch.length;
    } catch (err) {
      logger().error({ err, batch: i / BATCH_SIZE + 1 }, "Bulk mail batch failed");
      result.failed += batch.length;
    }
  }

  return result;
}

/**
 * The same announcement to many recipients, each as their OWN email — never
 * one message with everyone in `to`, which showed every address to every
 * recipient.
 */
export async function sendBulkMail(
  recipients: readonly string[],
  subject: string,
  content: AnnouncementContent,
): Promise<BulkMailResult> {
  return await sendMailBatch(recipients.map((to) => ({ to, subject, ...content })));
}
