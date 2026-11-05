import { Expo, type ExpoPushMessage, type ExpoPushTicket } from "expo-server-sdk";

import { PushToken } from "../models/pushToken.js";
import { logger } from "./logger.js";

export interface PushPayload {
  message: string;
  title?: string;
  /** Anything else is forwarded to Expo as-is (e.g. `data`, `badge`). */
  [key: string]: unknown;
}

/** Expo asks for receipts to be read after about this long. */
const RECEIPT_DELAY_MS = 15 * 60 * 1000;
const WRONG_PROJECT_MIX = "PUSH_TOO_MANY_EXPERIENCE_IDS";
const DEVICE_GONE = "DeviceNotRegistered";

/**
 * Sends a push notification and never throws.
 *
 * Callers fire this without awaiting it, and an unhandled rejection is fatal
 * to the process (see index.ts), so every failure is logged here instead.
 */
export async function sendPushNotificationTo(
  tokens: string | string[],
  { message, title, ...otherData }: PushPayload,
): Promise<void> {
  try {
    const valid = [...new Set([tokens].flat())].filter((token) => Expo.isExpoPushToken(token));
    if (!valid.length) return;

    const expo = new Expo();
    const receiptTokens = new Map<string, string>();
    const template = {
      sound: "default",
      body: message,
      title,
      priority: "high",
      channelId: "default",
      ...otherData,
    };

    await Promise.all(
      expo
        .chunkPushNotifications([{ ...template, to: valid } as ExpoPushMessage])
        .map((chunk) => sendChunk(expo, chunk, template, receiptTokens)),
    );

    if (receiptTokens.size) {
      setTimeout(() => void checkPushReceipts(expo, receiptTokens), RECEIPT_DELAY_MS).unref();
    }
  } catch (err) {
    logger().error({ err }, "Error sending push notifications");
  }
}

async function sendChunk(
  expo: Expo,
  chunk: ExpoPushMessage[],
  template: Record<string, unknown>,
  receiptTokens: Map<string, string>,
): Promise<void> {
  try {
    const tickets = await expo.sendPushNotificationsAsync(chunk);
    const tokens = chunk.flatMap((message) => [message.to].flat());
    await recordTickets(tickets, tokens, receiptTokens);
  } catch (err) {
    const projects = tokensByProject(err);
    if (!projects) {
      logger().error({ err }, "Error sending a push notification chunk");
      return;
    }
    // Expo refuses a whole request if its tokens span Expo projects, as a shared
    // table of old and new app installs can. Every project still gets its copy.
    await Promise.all(
      projects.map((to) =>
        sendChunk(expo, [{ ...template, to } as ExpoPushMessage], template, receiptTokens),
      ),
    );
  }
}

function tokensByProject(err: unknown): string[][] | undefined {
  const { code, details } = err as { code?: string; details?: Record<string, string[]> };
  if (code !== WRONG_PROJECT_MIX || !details) return undefined;
  return Object.values(details).filter((tokens) => tokens.length > 0);
}

/** Expo answers per recipient, in the order they were sent. */
async function recordTickets(
  tickets: ExpoPushTicket[],
  tokens: string[],
  receiptTokens: Map<string, string>,
): Promise<void> {
  const gone: string[] = [];
  tickets.forEach((ticket, index) => {
    const token = tokens[index];
    if (ticket.status === "ok") {
      if (token) receiptTokens.set(ticket.id, token);
    } else if (ticket.details?.error === DEVICE_GONE && token) {
      gone.push(token);
    } else {
      logger().error(
        { error: ticket.details?.error, reason: ticket.message },
        "Expo refused a push",
      );
    }
  });
  await forgetTokens(gone);
}

/**
 * Whether the phones' push services really took them. Only this shows problems
 * such as bad credentials or uninstalled apps; Expo's first answer just means it
 * accepted the job. Best effort: a restart inside the delay loses that check.
 */
export async function checkPushReceipts(
  expo: Expo,
  receiptTokens: ReadonlyMap<string, string>,
): Promise<void> {
  try {
    const gone: string[] = [];
    for (const ids of expo.chunkPushNotificationReceiptIds([...receiptTokens.keys()])) {
      const receipts = await expo.getPushNotificationReceiptsAsync(ids);
      for (const [id, receipt] of Object.entries(receipts)) {
        if (receipt.status === "ok") continue;
        const token = receiptTokens.get(id);
        if (receipt.details?.error === DEVICE_GONE && token) gone.push(token);
        else
          logger().error(
            { error: receipt.details?.error, reason: receipt.message },
            "A push was not delivered",
          );
      }
    }
    await forgetTokens(gone);
  } catch (err) {
    logger().error({ err }, "Could not read push receipts");
  }
}

async function forgetTokens(tokens: string[]): Promise<void> {
  if (tokens.length) await PushToken.deleteMany({ pushToken: { $in: tokens } });
}
