import jwt from "jsonwebtoken";

import { config } from "../config/index.js";
import type { StreamSourceDoc } from "../domain/stream.types.js";
import type { IssuedTokenCustom } from "../domain/user.types.js";
import { createFeedToken } from "./stream.js";
import { toStreamUser } from "./users.js";

/**
 * The app's JWT for `doc`.
 *
 * `custom` is built from the Stream whitelist, never the raw `doc.custom`, so a
 * legacy `feedToken` or an `expoPushToken` sitting in Mongo can't ride along.
 * The `feedToken` is minted here, for this user only: both clients connect
 * Stream Feeds and Chat with it straight out of the token.
 */
export function issueAuthToken(doc: StreamSourceDoc): string {
  const { id, name, image, custom } = toStreamUser(doc);
  const claims: IssuedTokenCustom = {
    username: custom.username,
    verified: custom.verified,
    isAdmin: custom.isAdmin,
    feedToken: createFeedToken(id),
  };

  return jwt.sign({ id, name, image, custom: claims }, config().jwtSecret);
}
