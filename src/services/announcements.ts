import { PushAnnouncement } from "../models/pushAnnouncement.js";
import { logger } from "../utils/logger.js";
import { sendPushNotificationTo, type PushPayload } from "../utils/pushNotifications.js";
import type { PushCategory } from "../models/pushPreference.js";
import { pushTokensOf, reachableRecipients } from "./pushAudience.js";

/** Room for a name and a couple of lines on a lock screen. */
const MAX_BODY_CHARS = 140;
const DUPLICATE_KEY = 11000;

/**
 * Claims the right to announce something, once.
 *
 * `key` is what was announced: a sparkle's activity id, or `comment:<id>` and
 * `message:<id>`. A retried or replayed request finds the claim and sends nothing.
 */
export async function claimAnnouncement(
  key: string,
  authorId: string,
  anonymous = false,
): Promise<boolean> {
  try {
    await PushAnnouncement.create({ activityId: key, authorId, anonymous });
    return true;
  } catch (err) {
    if ((err as { code?: number }).code === DUPLICATE_KEY) return false;
    throw err;
  }
}

/**
 * Sends behind the response: a slow Stream or Expo must not hold up, or fail,
 * the write the sender already made.
 */
export function deliverInBackground(
  senderId: string,
  recipients: () => Promise<readonly string[]>,
  category: PushCategory,
  push: PushPayload,
  failure: string,
): void {
  void (async () => {
    const reachable = await reachableRecipients(senderId, await recipients(), category);
    await sendPushNotificationTo(await pushTokensOf(reachable), push);
  })().catch((err: unknown) => logger().error({ err, senderId }, failure));
}

export function pushTitle(name: string | undefined, handle: string | undefined): string {
  if (name && handle) return `${name} (@${handle})`;
  if (name) return name;
  return handle ? `@${handle}` : "Sparkler";
}

/** Newlines would render as real breaks, and an empty body as a blank banner. */
export function pushBody(text: string | undefined, fallback: string): string {
  const line = text?.replace(/\s+/g, " ").trim();
  if (!line) return fallback;
  return line.length > MAX_BODY_CHARS ? `${line.slice(0, MAX_BODY_CHARS - 1).trimEnd()}…` : line;
}

export function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

/** "Kai mentioned you", opening the sparkle or reply that did. */
export function mentionPush(
  author: { name?: string; custom?: Record<string, unknown> },
  text: string | undefined,
  statusId: string,
): PushPayload {
  const handle = handleOf(author);
  return {
    title: `${author.name || (handle ? `@${handle}` : "Someone")} mentioned you`,
    message: pushBody(text, "Tap to see where"),
    data: { kind: "mention", type: "mention", id: statusId },
  };
}

/** A Stream user's handle, kept in `custom.username`. */
export function handleOf(user: { custom?: Record<string, unknown> } | undefined) {
  return stringOrUndefined(user?.custom?.["username"]);
}
