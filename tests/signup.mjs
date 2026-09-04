// End-to-end check of the first-time sign-in fix and the feed-token exposure fix.
// Runs against a throwaway in-memory MongoDB. Stream credentials are deliberately
// fake, so no request ever reaches the real Stream app — which also exercises the
// requirement that a Stream outage must not fail a sign-in.
//
//   npm run test:signup

import { MongoMemoryServer } from "mongodb-memory-server";

const mongod = await MongoMemoryServer.create();

process.env.db = mongod.getUri();
process.env.PORT = "3999";
process.env.jwtPrivateKey = "test-only-secret-not-used-in-production-0123456789";
process.env.NEW_FEED_API_KEY = "test_key";
process.env.NEW_CHAT_API_SECRET = "test_secret_value_for_local_testing_only";
process.env.chatApiKey = "test_key";
process.env.chatApiSecret = "test_secret_value_for_local_testing_only";
process.env.RESEND_API_KEY = "re_test_key";
process.env.POE_API_KEY = "test";

const { default: server } = await import("../index.js");
const mongoose = (await import("mongoose")).default;

const BASE = "http://localhost:3999/api/sparklers";
let failures = 0;
const check = (label, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};

// Wait for the mongoose connection opened by startup/db.js.
for (let i = 0; i < 50 && mongoose.connection.readyState !== 1; i++)
  await new Promise((r) => setTimeout(r, 100));
check("connected to in-memory mongo", mongoose.connection.readyState === 1);

const post = async (path, body) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text(), token: res.headers.get("x-auth-token") };
};

for (const route of ["/quick", "/auth-google"]) {
  const email = `new${Date.now()}${route.replace(/\W/g, "")}@example.com`;

  console.log(`\n--- ${route} ---`);

  // The headline bug: this used to throw a TypeError and return 500.
  const first = await post(route, { email, name: "New Student" });
  check(`${route} brand-new email succeeds`, first.status === 200, `HTTP ${first.status}`);
  check(`${route} returns an x-auth-token header`, Boolean(first.token));

  // Sign-in must survive Stream being unreachable (fake creds = guaranteed failure).
  check(`${route} succeeds despite Stream being unreachable`, first.status === 200);

  const second = await post(route, { email, name: "New Student" });
  check(`${route} returning user succeeds`, second.status === 200, `HTTP ${second.status}`);

  const Sparkler = mongoose.model("Sparkler");
  const docs = await Sparkler.find({ email }).lean();
  check(`${route} created exactly one account`, docs.length === 1, `found ${docs.length}`);
  check(`${route} persists no feedToken in mongo`, !("feedToken" in (docs[0]?.custom ?? {})));
  check(`${route} assigned a username`, Boolean(docs[0]?.custom?.username));

  const jwtPayload = JSON.parse(
    Buffer.from(first.token.split(".")[1], "base64url").toString(),
  );
  check(`${route} JWT carries no feedToken`, !JSON.stringify(jwtPayload).includes("feedToken"));

  const bad = await post(route, {});
  check(`${route} rejects empty body with 400`, bad.status === 400, `HTTP ${bad.status}`);
}

console.log("\n--- exposure surface ---");
const anon = await fetch(BASE);
check("GET / rejects unauthenticated callers", anon.status === 401, `HTTP ${anon.status}`);

const anonTok = await fetch(`${BASE}/feed-token`);
check("GET /feed-token rejects unauthenticated callers", anonTok.status === 401, `HTTP ${anonTok.status}`);

// An ordinary signed-in user listing everyone must not see credentials.
const victim = await post("/quick", { email: `victim${Date.now()}@example.com`, name: "Victim" });
const listed = await fetch(BASE, { headers: { "x-auth-token": victim.token } });
const listBody = await listed.text();
check("GET / is readable by a signed-in user", listed.status === 200, `HTTP ${listed.status}`);
check("GET / leaks no feedToken", !listBody.includes("feedToken"));
check("GET / leaks no authCode", !listBody.includes("authCode"));

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nAll checks passed");

await mongoose.disconnect();
server.close();
await mongod.stop();
process.exit(failures ? 1 : 0);
