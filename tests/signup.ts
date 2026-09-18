// End-to-end check of the first-time sign-in fix and the feed-token exposure fix.
// Runs against a throwaway in-memory MongoDB. Stream credentials are deliberately
// fake, so no request ever reaches the real Stream app — which also exercises the
// requirement that a Stream outage must not fail a sign-in.
//
// Runs the BUILT server (dist/) under plain Node, with Node's native type
// stripping — not vitest. That is the point: it catches bugs that only appear in
// the compiled output, such as a CommonJS named import that typechecks and
// passes under vitest's bundler but throws under Node.
//
//   npm run test:signup

import type { Server } from "node:http";

import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";

interface SparklerLean {
  email?: string;
  name?: string;
  authCode?: string;
  custom?: Record<string, unknown>;
}

const mongod = await MongoMemoryServer.create();

process.env.db = mongod.getUri();
process.env.PORT = "3999";
process.env.LOG_LEVEL = "silent";
process.env.jwtPrivateKey = "test-only-secret-not-used-in-production-0123456789";
process.env.NEW_FEED_API_KEY = "test_key";
process.env.NEW_CHAT_API_SECRET = "test_secret_value_for_local_testing_only";
process.env.RESEND_API_KEY = "re_test_key";

// A non-literal specifier, so tsc does not try to typecheck the build output.
const entry = "../dist/index.js";
const { default: server } = (await import(entry)) as { default: Server };

const BASE = "http://localhost:3999/api/sparklers";
let failures = 0;
const check = (label: string, cond: unknown, detail = ""): void => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  (${detail})` : ""}`);
  if (!cond) failures++;
};

// The entrypoint connects before listening; wait for that connection.
for (let i = 0; i < 50 && mongoose.connection.readyState !== 1; i++)
  await new Promise((r) => setTimeout(r, 100));
check("connected to in-memory mongo", mongoose.connection.readyState === 1);

const post = async (path: string, body: unknown) => {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.text(), token: res.headers.get("x-auth-token") };
};

const jwtPayload = (token: string | null): Record<string, unknown> =>
  JSON.parse(Buffer.from(token?.split(".")[1] ?? "", "base64url").toString()) as Record<
    string,
    unknown
  >;

const Sparkler = mongoose.model("Sparkler");

for (const route of ["/quick"]) {
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

  const docs = await Sparkler.find({ email }).lean<SparklerLean[]>();
  check(`${route} created exactly one account`, docs.length === 1, `found ${docs.length}`);
  check(`${route} persists no feedToken in mongo`, !("feedToken" in (docs[0]?.custom ?? {})));
  check(`${route} assigned a username`, Boolean(docs[0]?.custom?.username));

  // The clients connect Stream with custom.feedToken straight out of the JWT.
  // It is minted for this user at issue time and never stored (checked above).
  const claims = jwtPayload(first.token) as { id: string; custom: Record<string, unknown> };
  const feedToken = claims.custom.feedToken;
  check(`${route} JWT carries a feedToken`, typeof feedToken === "string");
  check(
    `${route} JWT feedToken is scoped to this user`,
    jwtPayload(String(feedToken)).user_id === claims.id,
  );

  const bad = await post(route, {});
  check(`${route} rejects empty body with 400`, bad.status === 400, `HTTP ${bad.status}`);
}

console.log("\n--- exposure surface ---");
// The directory is public (both clients load it without a token), so it must
// carry no email and no credential of any kind.
const victim = await post("/quick", { email: `victim${Date.now()}@example.com`, name: "Victim" });
const anon = await fetch(BASE);
const listBody = await anon.text();
check("GET / is readable without a token", anon.status === 200, `HTTP ${anon.status}`);
check("GET / leaks no feedToken", !listBody.includes("feedToken"));
check("GET / leaks no authCode", !listBody.includes("authCode"));
check("GET / leaks no email", !listBody.includes("@example.com"));

console.log("\n--- PATCH / mass assignment ---");

const patch = async (body: unknown) =>
  fetch(BASE, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-auth-token": victim.token ?? "" },
    body: JSON.stringify(body),
  });

const victimId = jwtPayload(victim.token).id as string;

// Privilege escalation: forwarding req.body let any caller grant themselves admin.
const escalate = await patch({ name: "Victim", custom: { isAdmin: true } });
const before = await Sparkler.findById(victimId).lean<SparklerLean>();

check("PATCH / accepts the request", escalate.status === 200, `HTTP ${escalate.status}`);
const reissued = jwtPayload(escalate.headers.get("x-auth-token")) as {
  custom?: Record<string, unknown>;
};
check("PATCH / reissues a JWT that carries a feedToken", Boolean(reissued.custom?.feedToken));
check("PATCH / reissued JWT does NOT claim isAdmin", reissued.custom?.isAdmin === false);
check(
  "PATCH / does NOT grant isAdmin",
  !before?.custom?.isAdmin,
  `isAdmin=${String(before?.custom?.isAdmin)}`,
);
check("PATCH / applied the legitimate field", before?.name === "Victim", `name=${before?.name}`);
check("PATCH / preserved existing custom.username", Boolean(before?.custom?.username));

// Other privileged/immutable fields must be equally unreachable.
await patch({ email: "attacker@example.com", authCode: "pwned", custom: { verified: true } });
const after = await Sparkler.findById(victimId).lean<SparklerLean>();
check("PATCH / cannot change email", after?.email === before?.email);
check("PATCH / cannot set authCode", !after?.authCode);
check("PATCH / cannot self-verify", !after?.custom?.verified);

const empty = await patch({ custom: { isAdmin: true } });
check(
  "PATCH / rejects a body with no updatable fields",
  empty.status === 400,
  `HTTP ${empty.status}`,
);

console.log(failures ? `\n${failures} CHECK(S) FAILED` : "\nAll checks passed");

await mongoose.disconnect();
server.close();
await mongod.stop();
process.exit(failures ? 1 : 0);
