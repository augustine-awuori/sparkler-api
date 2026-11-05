import { isValidObjectId } from "mongoose";

import { PushPreference, type PushCategory } from "../models/pushPreference.js";
import { PushToken } from "../models/pushToken.js";
import { logger } from "../utils/logger.js";
import { streamClient } from "./stream.js";

const BLOCK_LOOKUP_BATCH = 100;

/**
 * Whoever may hear about something `senderId` did.
 *
 * On the server because a sender's app can't know who has blocked or muted them.
 * Both live on Stream: blocks work both ways there, and mutes are Stream Chat's
 * `muteUser`. If Stream can't answer this sends to nobody: a missed notification
 * is better than one from someone a person blocked. `category` also drops anyone
 * who turned that kind of notification off.
 */
export async function reachableRecipients(
  senderId: string,
  recipientIds: readonly unknown[],
  category?: PushCategory,
): Promise<string[]> {
  const candidates = [...new Set(recipientIds)].filter(
    (id): id is string => typeof id === "string" && isValidObjectId(id) && id !== senderId,
  );
  if (!candidates.length) return [];

  try {
    const silenced = new Set<string>();

    if (category) {
      const optedOut = await PushPreference.find(
        { userId: { $in: candidates }, off: category },
        { userId: 1 },
      ).lean();
      for (const row of optedOut) silenced.add(row.userId.toString());
    }

    const { blocks } = await streamClient().getBlockedUsers({ user_id: senderId });
    for (const block of blocks) silenced.add(block.blocked_user_id);

    for (let index = 0; index < candidates.length; index += BLOCK_LOOKUP_BATCH) {
      const batch = candidates.slice(index, index + BLOCK_LOOKUP_BATCH);
      const { users } = await streamClient().queryUsers({
        payload: { filter_conditions: { id: { $in: batch } }, limit: batch.length },
      });
      for (const user of users) {
        const blockedSender = user.blocked_user_ids?.includes(senderId);
        const mutedSender = user.mutes?.some((mute) => mute.target?.id === senderId);
        if (blockedSender || mutedSender) silenced.add(user.id);
      }
    }

    return candidates.filter((id) => !silenced.has(id));
  } catch (err) {
    logger().error({ err, senderId }, "Could not check blocks; notification not sent");
    return [];
  }
}

export async function pushTokensOf(userIds: readonly string[]): Promise<string[]> {
  const rows = await PushToken.find({ userId: { $in: userIds } }, { pushToken: 1 }).lean();
  return rows.map((row) => row.pushToken);
}

export async function everyoneWithAPushToken(): Promise<string[]> {
  const ids = await PushToken.distinct("userId");
  return ids.map((id) => id.toString());
}
