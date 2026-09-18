import { StreamClient } from "@stream-io/node-sdk";

import { config } from "../config/index.js";

/**
 * The Stream Feeds v3 client, built on first use.
 *
 * The old routers constructed clients at module top level, so merely importing
 * a router demanded a full environment. Deferring to first use keeps config()
 * the single, entrypoint-driven reader of credentials.
 */

let feeds: StreamClient | undefined;

/** Feeds v3 (@stream-io/node-sdk): users and upserts. */
export function streamClient(): StreamClient {
  const { apiKey, apiSecret } = config().stream;
  feeds ??= new StreamClient(apiKey, apiSecret);
  return feeds;
}

/**
 * A Stream user token for `userId` only. Never persisted, never written to
 * Stream — it travels only inside that user's own JWT (see authToken.ts).
 *
 * It has no expiry on purpose: the clients cache their JWT and reuse it without
 * checking `exp`, so an expiring token would silently break feeds and chat once
 * it lapsed. It is no weaker than the non-expiring JWT that carries it. Add a
 * expiry (generateUserToken with a validity) only once the clients
 * re-authenticate on expiry. Note generateUserToken with NO validity is not
 * permanent — the SDK defaults it to one hour.
 */
export function createFeedToken(userId: string): string {
  return streamClient().generatePermanentUserToken({ user_id: userId });
}
