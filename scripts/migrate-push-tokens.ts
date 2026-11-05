// One-off migration: moves PushToken from one row per account to one row per
// device. Run once, as the API version that needs it is deployed.
//
//   npx tsx --env-file=.env scripts/migrate-push-tokens.ts --confirm
//
// Until it has run, a second phone on an account fails to register, because the
// old unique index on `userId` is still in the database.

import mongoose from "mongoose";

import { requireEnv } from "../src/config/env.js";
import { PushToken } from "../src/models/pushToken.js";

if (!process.argv.includes("--confirm")) {
  console.error("Refusing to run without --confirm. This changes PushToken indexes and rows.");
  process.exit(1);
}

await mongoose.connect(requireEnv("db"));
const collection = PushToken.collection;

const indexes = await collection.indexes();
if (indexes.some((index) => index.name === "userId_1" && index.unique)) {
  await collection.dropIndex("userId_1");
  console.log("Dropped the unique index on userId");
}

// Newest row wins: that is the account most recently signed in on the device.
const rows = await collection
  .find({}, { projection: { pushToken: 1 } })
  .sort({ _id: -1 })
  .toArray();
const seen = new Set<string>();
const duplicates = rows.filter((row) => {
  const token = String(row["pushToken"]);
  if (seen.has(token)) return true;
  seen.add(token);
  return false;
});
if (duplicates.length) {
  await collection.deleteMany({ _id: { $in: duplicates.map((row) => row._id) } });
}
console.log(`Removed ${duplicates.length} rows for devices held by an older account`);

await PushToken.syncIndexes();
console.log("Indexes are up to date");

await mongoose.disconnect();
process.exit(0);
