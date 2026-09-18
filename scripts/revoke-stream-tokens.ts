// One-off incident-response script: invalidates every Stream token issued before
// now, across the app (chat and feeds share one Stream app).
//
// Run this after deleting the old, leaked key pair in the Stream dashboard.
// It is what kills the ~365-day feed tokens that were exposed via `custom.feedToken`.
//
//   npx tsx --env-file=.env scripts/revoke-stream-tokens.ts --confirm
//
// EVERY signed-in user must obtain a new token afterwards (the app does this
// automatically via GET /api/sparklers/feed-token; older client builds cannot).

import { StreamChat } from "stream-chat";

import { requireEnv } from "../src/config/env.js";

if (!process.argv.includes("--confirm")) {
  console.error(
    "Refusing to run without --confirm.\n" +
      "This signs out every user of the Stream app and cannot be undone.",
  );
  process.exit(1);
}

const key = requireEnv("NEW_FEED_API_KEY");
const client = StreamChat.getInstance(key, requireEnv("NEW_CHAT_API_SECRET"));
const before = new Date();

console.log(`Revoking all Stream tokens issued before ${before.toISOString()}`);
console.log(`  app key: ${key}`);

await client.revokeTokens(before);

console.log("Done. All previously issued tokens are now invalid.");
process.exit(0);
