import { streamClient } from "./stream.js";

const USER_FEED_GROUP = "user";

/**
 * Makes an account the owner of its own `user:` feed, if it isn't already. Some were
 * created by a guest before the account first connected, and Stream refuses a pin to
 * a feed you don't own. `created_by_id` needs the API secret, so a phone can't do it.
 */
export async function claimOwnUserFeed(userId: string): Promise<void> {
  const { feeds } = streamClient();
  const current = await feeds.getOrCreateFeed({
    feed_group_id: USER_FEED_GROUP,
    feed_id: userId,
    user_id: userId,
    limit: 1,
  });
  if (current.feed?.created_by?.id === userId) return;
  await feeds.updateFeed({
    feed_group_id: USER_FEED_GROUP,
    feed_id: userId,
    created_by_id: userId,
  });
}
