import { isValidObjectId } from "mongoose";

import type { DirectoryUser, StreamSourceDoc, StreamUser } from "../domain/stream.types.js";
import { PROFILE_STRING_FIELDS, type SparklerProfile } from "../domain/user.types.js";
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

/** Only the whitelisted profile fields, and only when they have the right type. */
export function pickProfile(source: Record<string, unknown> | null | undefined): SparklerProfile {
  const profile: SparklerProfile = {};
  if (!source) return profile;

  for (const key of PROFILE_STRING_FIELDS) {
    const value = source[key];
    if (typeof value === "string") profile[key] = value;
  }
  if (typeof source.isProfilePrivate === "boolean")
    profile.isProfilePrivate = source.isProfilePrivate;

  return profile;
}

// A Sparkler as the public directory shows it. GET /api/sparklers is
// unauthenticated, so this carries no email and no credential of any kind: the
// Stream whitelist's permission flags plus the user's own profile fields.
export function toDirectoryUser(doc: StreamSourceDoc): DirectoryUser {
  const { id, name, image, custom } = toStreamUser(doc);

  return {
    id,
    name,
    image,
    ...(doc.timestamp ? { createdAt: new Date(doc.timestamp).toISOString() } : {}),
    custom: {
      username: custom.username,
      verified: custom.verified,
      isAdmin: custom.isAdmin,
      ...pickProfile(doc.custom as Record<string, unknown> | null | undefined),
    },
  };
}

/** The user (other than `exceptId`) who already holds `username`, if any. */
export async function isUsernameTaken(username: string, exceptId: string): Promise<boolean> {
  return (await Sparkler.exists({ "custom.username": username, _id: { $ne: exceptId } })) !== null;
}

/** Null for a missing user AND for an id that is not an ObjectId (no CastError). */
export async function findSparklerById(id: string): Promise<SparklerDoc | null> {
  if (!isValidObjectId(id)) return null;

  return await Sparkler.findById(id);
}
