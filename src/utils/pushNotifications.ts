import { Expo, type ExpoPushMessage } from "expo-server-sdk";

import { logger } from "./logger.js";

export interface PushPayload {
  message: string;
  title?: string;
  /** Anything else is forwarded to Expo as-is (e.g. `data`, `badge`). */
  [key: string]: unknown;
}

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
    const expo = new Expo();
    const chunks = expo.chunkPushNotifications([
      {
        to: tokens,
        sound: "default",
        body: message,
        title,
        ...otherData,
      } as ExpoPushMessage,
    ]);

    await Promise.all(
      chunks.map(async (chunk) => {
        try {
          await expo.sendPushNotificationsAsync(chunk);
        } catch (err) {
          logger().error({ err }, "Error sending a push notification chunk");
        }
      }),
    );
  } catch (err) {
    logger().error({ err }, "Error sending push notifications");
  }
}
