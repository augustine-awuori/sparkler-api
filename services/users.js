import { isValidObjectId } from "mongoose";

import { Sparkler } from "../models/sparkler.js";

function generateUsername(name) {
  return name.replace(/\s+/g, "").toLowerCase();
}

function generateRandomNumber() {
  return Math.floor(Math.random() * 900) + 100;
}

async function findByUsername(username) {
  return await Sparkler.findOne({ "custom.username": username });
}

export async function findUniqueUsername(name) {
  let username = generateUsername(name);
  let found = await findByUsername(username);

  while (found) {
    const randomNumber = generateRandomNumber();
    username = `${generateUsername(name)}${randomNumber}`;
    found = await findByUsername(username);
  }

  return username;
}

// The only `custom` fields Stream is ever allowed to see. Stream returns a user's
// `custom` object on every activity, comment, reaction and member list it embeds
// them in, so anything added here becomes readable by every other signed-in user.
// Never put a credential (feedToken, chatToken, authCode) in this list.
export function toStreamUser(doc) {
  const { email, verified, isAdmin, username, invalid } = doc.custom ?? {};

  return {
    id: (doc._id ?? doc.id).toString(),
    name: doc.name ?? "",
    image: doc.image ?? "",
    custom: {
      // Top-level `email` is always set; `custom.email` only on some paths.
      email: doc.email ?? email,
      verified: verified ?? false,
      isAdmin: isAdmin ?? false,
      username: username ?? "",
      invalid: invalid ?? false,
    },
  };
}

// Shape of a Sparkler as returned to an API caller. Drops the bcrypt `authCode`
// hash and reuses the Stream whitelist for `custom`.
export function toPublicUser(doc) {
  const { id, name, image, custom } = toStreamUser(doc);

  return { id, name, image, email: doc.email, timestamp: doc.timestamp, custom };
}

const findByIdAndUpdate = async (id, update, options) => {
  if (!isValidObjectId(id)) return;

  return await Sparkler.findByIdAndUpdate(id, update, options);
};

const exists = async (userId) => {
  if (isValidObjectId(userId)) return await Sparkler.findById(userId);
};

export const findById = async (id) => {
  const user = await exists(id);

  return user;
};

export default { findById, findByIdAndUpdate };
