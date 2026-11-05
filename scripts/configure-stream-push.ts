// Turns on Stream's own push for follows, replies, likes and mentions, for every
// push provider set up in the Stream dashboard. Safe to run again.
//
//   npx tsx --env-file=.env scripts/configure-stream-push.ts --confirm
//
// Add the Firebase provider in the dashboard first (name it "firebase"), or Android
// gets no templates: Push Notifications > New Configuration > Firebase.

import { StreamClient } from "@stream-io/node-sdk";

import { requireEnv } from "../src/config/env.js";
import {
  DISABLED_STREAM_PUSH_EVENT,
  STREAM_PUSH_COPY,
  USER_FEED_PUSH_TYPES,
  streamPushTemplate,
  type StreamPushEvent,
  type StreamPushProviderType,
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
  (provider): provider is typeof provider & { type: StreamPushProviderType } =>
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

for (const { type, name } of supported) {
  for (const event of Object.keys(STREAM_PUSH_COPY) as StreamPushEvent[]) {
    await client.upsertPushTemplate({
      event_type: event,
      push_provider_type: type,
      push_provider_name: name,
      enable_push: true,
      template: streamPushTemplate(event, type),
    });
  }
  await client.upsertPushTemplate({
    event_type: DISABLED_STREAM_PUSH_EVENT,
    push_provider_type: type,
    push_provider_name: name,
    enable_push: false,
  });
  console.log(`Templates saved for ${name} (${type})`);
}

process.exit(0);
