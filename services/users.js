import stream from "getstream";
import { isValidObjectId } from "mongoose";

import { Sparkler } from "../models/sparkler.js";

export function getUserFeedToken(userId) {
  return stream
    .connect(process.env.feedApiKey, process.env.feedSecretKey)
    .createUserToken(userId.toString());
}

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
  let found = await findByUsername(name);

  while (found) {
    const randomNumber = generateRandomNumber();
    username = `${generateUsername(name)}${randomNumber}`;
    found = await findByUsername(username);
  }

  return username;
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
