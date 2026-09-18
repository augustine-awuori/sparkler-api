import { StreamClient } from "@stream-io/node-sdk";
import { StreamChat } from "stream-chat";

import { config } from "../config/index.js";

/**
 * Stream clients, built on first use.
 *
 * The old routers constructed these at module top level, so merely importing a
 * router demanded a full environment. Deferring to first use keeps config()
 * the single, entrypoint-driven reader of credentials.
 */

let feeds: StreamClient | undefined;

/** Feeds v3 (@stream-io/node-sdk): users, guests, membership levels. */
export function streamClient(): StreamClient {
  const { apiKey, apiSecret } = config().stream;
  feeds ??= new StreamClient(apiKey, apiSecret);
  return feeds;
}

/** Chat v2 (stream-chat). getInstance is itself a process-wide singleton. */
export function chatClient(): StreamChat {
  const { apiKey, apiSecret } = config().chat;
  return StreamChat.getInstance(apiKey, apiSecret);
}

/** A feed token for `userId` only. Never persisted, never written to Stream. */
export function createFeedToken(userId: string): string {
  return streamClient().generateUserToken({
    user_id: userId,
    validity_in_seconds: config().stream.feedTokenTtlSeconds,
  });
}
