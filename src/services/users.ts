import { isValidObjectId } from "mongoose";

import type { PublicUser, StreamSourceDoc, StreamUser } from "../domain/stream.types.js";
import { Sparkler, type SparklerDoc } from "../models/sparkler.js";

function generateUsername(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

function generateRandomNumber(): number {
  return Math.floor(Math.random() * 900) + 100;
}

async function findByUsername(username: string) {
  return await Sparkler.findOne({ "custom.username": username });
}

export async function findUniqueUsername(name: string): Promise<string> {
  let username = generateUsername(name);
  let found = await findByUsername(username);

  while (found) {
    username = `${generateUsername(name)}${generateRandomNumber()}`;
    found = await findByUsername(username);
  }

  return username;
}

// The only `custom` fields Stream is ever allowed to see. Stream returns a user's
// `custom` object on every activity, comment, reaction and member list it embeds
// them in, so anything added here becomes readable by every other signed-in user.
// Never put a credential (feedToken, chatToken, authCode) in this list.
export function toStreamUser(doc: StreamSourceDoc): StreamUser {
  const { email, verified, isAdmin, username, invalid } = doc.custom ?? {};

  return {
    id: doc._id.toString(),
    name: doc.name ?? "",
    image: doc.image ?? "",
    custom: {
      // Top-level `email` is always set; `custom.email` only on some paths.
      email: doc.email ?? email ?? "",
      verified: verified ?? false,
      isAdmin: isAdmin ?? false,
      username: username ?? "",
      invalid: invalid ?? false,
    },
  };
}

// Shape of a Sparkler as returned to an API caller. Drops the bcrypt `authCode`
// hash and reuses the Stream whitelist for `custom`.
export function toPublicUser(doc: StreamSourceDoc): PublicUser {
  const { id, name, image, custom } = toStreamUser(doc);

  return {
    id,
    name,
    image,
    email: doc.email ?? "",
    timestamp: doc.timestamp ?? undefined,
    custom,
  };
}

/** Null for a missing user AND for an id that is not an ObjectId (no CastError). */
export async function findSparklerById(id: string): Promise<SparklerDoc | null> {
  if (!isValidObjectId(id)) return null;

  return await Sparkler.findById(id);
}
