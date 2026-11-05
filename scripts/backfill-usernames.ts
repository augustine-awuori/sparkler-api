// One-off: gives every account with no username one. Without it they can't be
// mentioned and drop out of the directory the apps read badges from, so a verified
// account showed no check.
//
//   npx tsx --env-file=.env scripts/backfill-usernames.ts            (lists them)
//   npx tsx --env-file=.env scripts/backfill-usernames.ts --confirm  (writes them)

import mongoose from "mongoose";

import { loadConfig } from "../src/config/index.js";
import { Sparkler } from "../src/models/sparkler.js";
import { streamClient } from "../src/services/stream.js";
import { findUniqueUsername, toStreamUser } from "../src/services/users.js";

const config = loadConfig();
const confirmed = process.argv.includes("--confirm");

await mongoose.connect(config.databaseUrl);
const accounts = await Sparkler.find({
  $or: [{ "custom.username": { $exists: false } }, { "custom.username": { $in: ["", null] } }],
});
console.log(`${accounts.length} accounts have no username`);

for (const account of accounts) {
  const username = await findUniqueUsername(account.name ?? "");
  console.log(`${String(account._id)} -> ${username}`);
  if (!confirmed) continue;
  account.set("custom.username", username);
  await account.save();
  await streamClient().upsertUsers([toStreamUser(account)]);
}

if (!confirmed) console.log("Nothing written. Run with --confirm to write these.");
await mongoose.disconnect();
process.exit(0);
