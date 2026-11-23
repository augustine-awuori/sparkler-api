// Turns on Stream's own push for follows, replies, likes, mentions and messages,
// for every push provider set up in the Stream dashboard. Safe to run again.
//
//   npx tsx --env-file=.env scripts/configure-stream-push.ts --confirm
//
// Templates go to each provider by the name it has in the dashboard. Both apps
// register devices under those names: Firebase `sparkler_mobile` and APN `Chats_iOS`.
// Don't add a second Firebase provider. Devices registered under `sparkler_mobile`
// would never reach it.

import { StreamClient } from "@stream-io/node-sdk";

import { requireEnv } from "../src/config/env.js";
import {
  USER_FEED_PUSH_TYPES,
  pushTemplateUpserts,
  type StreamPushProvider,
} from "../src/services/streamPushTemplates.js";

if (!process.argv.includes("--confirm")) {
  console.error("Refusing to run without --confirm. This changes the live Stream app's push setup.");
  process.exit(1);
}

const client = new StreamClient(requireEnv("NEW_FEED_API_KEY"), requireEnv("NEW_CHAT_API_SECRET"), {
  timeout: 20_000,
});

const { push_providers: providers = [] } = await client.listPushProviders();
const supported = providers.filter(
  (provider): provider is typeof provider & StreamPushProvider =>
    provider.type === "firebase" || provider.type === "apn",
);
if (!supported.some((provider) => provider.type === "firebase")) {
  console.warn("No Firebase provider yet, so Android won't get these pushes.");
}

await client.feeds.updateFeedGroup({
  id: "user",
  push_notification: { enable_push: true, push_types: USER_FEED_PUSH_TYPES },
});
console.log("Enabled push on the user feed group");

for (const provider of supported) {
  for (const upsert of pushTemplateUpserts(provider)) {
    await client.upsertPushTemplate(upsert);
  }
  console.log(`Templates saved for ${provider.name} (${provider.type})`);
}

process.exit(0);
