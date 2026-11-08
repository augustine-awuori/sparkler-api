/**
 * Wire-contract baseline.
 *
 * Records what the API returns TODAY, before the TypeScript migration moves any
 * code. Its job is to fail loudly if a refactor changes bytes a client can see.
 *
 * An expectation that changes is edited in the same commit as the code, with a
 * `CHANGED IN ...` / `REMOVED IN ...` comment — which makes the behaviour-change
 * ledger reviewable as a diff rather than a prose list.
 *
 * The surface is exactly what the mobile (SparklerMobile) and web (sparkler_web)
 * clients call, plus the admin-only mails and sparkler ops routes.
 */
import { findUniqueUsername } from "../../src/services/users.js";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import type { FirebaseIdentity } from "../../src/services/firebaseIdentity.js";

// Resend is replaced so no email leaves the machine; every email the API would
// send lands in `outbox` instead.
type SentMail = { to: string; subject: string; text: string };
const outbox = vi.hoisted(() => [] as SentMail[]);
const verifyFirebaseIdTokenMock = vi.hoisted(() =>
  vi.fn(async (token: string): Promise<FirebaseIdentity> => ({
    id: `firebase-${token.slice("test:".length)}`,
    email: token.slice("test:".length),
  })),
);
vi.mock("resend", () => ({
  Resend: class {
    emails = {
      send: async (mail: SentMail) => {
        outbox.push(mail);
        return { data: { id: "test" }, error: null };
      },
    };
    batch = {
      send: async (mails: SentMail[]) => {
        outbox.push(...mails);
        return { data: { data: [] }, error: null };
      },
    };
  },
}));
vi.mock("../../src/services/firebaseIdentity.js", () => ({
  verifyFirebaseIdToken: verifyFirebaseIdTokenMock,
}));

const mailsTo = (email: string) => outbox.filter((mail) => mail.to === email);

let app: Application;
let api: () => request.Agent;

const userToken = (id: string, custom: Record<string, unknown> = {}) =>
  jwt.sign({ id, name: "Contract", custom }, process.env.jwtPrivateKey as string);

const unique = (label: string) =>
  `${label}${Date.now()}${Math.random().toString(36).slice(2, 8)}@example.com`;
const firebaseIdTokenFor = (email: string) => `test:${email}`;

const Sparkler = () => mongoose.model("Sparkler");

type StoredUser = { name: string; custom: Record<string, unknown> };

async function createUser(custom: Record<string, unknown> = {}) {
  const user = await Sparkler().create({ email: unique("user"), name: "Contract User", custom });
  return { id: user._id.toString(), token: userToken(user._id.toString()) };
}

beforeAll(async () => {
  const config = loadConfig();
  await connectDb(config.databaseUrl);
  // Indexes build in the background, and the sign-in race below relies on the
  // unique email index: without this wait it can create five accounts.
  await Sparkler().init();
  app = createApp();
  api = () => request(app);
  expect(mongoose.connection.readyState).toBe(1);
});

afterAll(async () => {
  await disconnectDb();
});

describe("unauthenticated reads", () => {
  it("GET /api/schools -> 200 array", async () => {
    const res = await api().get("/api/schools");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.type).toBe("application/json");
  });

  it("GET /api/sparklers is a public directory with no email or credentials", async () => {
    // CHANGED IN THE CLIENT TRIM (was 401): both clients load the directory
    // without a token, so it is public — and therefore carries no email and no
    // credential, only the whitelisted profile fields.
    await Sparkler().create({
      email: unique("dir"),
      name: "Directory",
      custom: { username: "dir-user", bio: "hi", feedToken: "LEAK", isAdmin: false },
    });
    const res = await api().get("/api/sparklers");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    const entry = (res.body as Array<{ createdAt: unknown; custom: Record<string, unknown> }>).find(
      (u) => u.custom.username === "dir-user",
    );
    expect(entry?.custom.bio).toBe("hi");
    expect(typeof entry?.createdAt).toBe("string");
    expect(JSON.stringify(res.body)).not.toMatch(/email|feedToken|authCode|LEAK/);
  });

  it("GET /api/sparklers/:id -> the same projection, 404 when unknown", async () => {
    const { id } = await createUser({ username: "by-id", campus: "Main" });
    const res = await api().get(`/api/sparklers/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(id);
    expect(res.body.custom.campus).toBe("Main");
    expect(res.body.email).toBeUndefined();

    const missing = await api().get(`/api/sparklers/${new mongoose.Types.ObjectId().toString()}`);
    expect(missing.status).toBe(404);
    expect((await api().get("/api/sparklers/not-an-id")).status).toBe(404);
  });
});

describe("removed routers", () => {
  // REMOVED IN THE CLIENT TRIM: neither client calls these, so they 404 now.
  it.each([
    "/api/alumnis",
    "/api/bugs",
    "/api/departments",
    "/api/programmes",
    "/api/reports",
    "/api/verifications",
  ])("GET %s -> 404", async (path) => {
    expect((await api().get(path)).status).toBe(404);
  });

  it.each([
    "/api/chatToken",
    "/api/grao",
    "/api/feedback",
    "/api/sparklers/auth-code",
    "/api/sparklers/auth-google",
  ])("POST %s -> 404", async (path) => {
    expect((await api().post(path).send({})).status).toBe(404);
  });
});

describe("auth gating", () => {
  const unauthenticated: ReadonlyArray<[string, () => request.Test]> = [
    ["PATCH /api/sparklers", () => api().patch("/api/sparklers")],
    [
      "PATCH /api/sparklers/:id",
      () => api().patch(`/api/sparklers/${new mongoose.Types.ObjectId().toString()}`),
    ],
    ["DELETE /api/sparklers", () => api().delete("/api/sparklers")],
    ["POST /api/pushTokens", () => api().post("/api/pushTokens")],
    ["POST /api/mails/all", () => api().post("/api/mails/all")],
    ["GET /api/errors/groups", () => api().get("/api/errors/groups")],
    ["GET /api/errors/stats", () => api().get("/api/errors/stats")],
    ["POST /api/errors/developers/register", () => api().post("/api/errors/developers/register")],
  ];

  it.each(unauthenticated)("%s without a token -> 401", async (_label, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(typeof res.body.error).toBe("string");
  });

  it("a malformed token -> 401", async () => {
    // CHANGED IN THE TS PORT (was 400): routes now use authenticate() instead
    // of the legacy middlewares/auth.js, which answered 400 for a bad token.
    const res = await api().patch("/api/sparklers").set("x-auth-token", "garbage");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid token. User doesn't exist");
  });

  it.each([
    ["PATCH", "/api/sparklers/sync"],
    ["POST", "/api/mails/preview"],
    ["POST", "/api/mails/all"],
  ])("admin-only %s %s rejects a non-admin with 403", async (method, path) => {
    // The token's isAdmin claim is not trusted — only the database flag is.
    const token = userToken(new mongoose.Types.ObjectId().toString(), { isAdmin: true });
    const res = await (method === "PATCH" ? api().patch(path) : api().post(path))
      .set("x-auth-token", token)
      .send({ subject: "s", message: "m" });
    expect(res.status).toBe(403);
  });
});

describe("error body shape", () => {
  // CHANGED IN THIS FIX: /quick now requires proof of the Firebase identity;
  // body email alone must never establish an account session.
  it("a quick sign-in without a Firebase ID token is rejected", async () => {
    const res = await api()
      .post("/api/sparklers/quick")
      .send({ email: { $ne: null }, name: "Injected" });
    expect(res.status).toBe(401);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error).toBe("Firebase ID token is required");
  });

  it("an unknown route returns a JSON 404", async () => {
    // CHANGED IN PHASE 3 (previously HUNG and never responded): the error
    // middleware now has arity 4, so Express treats it as an error handler
    // instead of ordinary middleware that swallowed unmatched requests.
    const res = await api().get("/api/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.type).toBe("application/json");
    expect(res.body.code).toBe("not_found");
    expect(typeof res.body.requestId).toBe("string");
  });
});

describe("sign-in returns a BARE JWT string, not JSON", () => {
  // The single most breakable contract in the API: the body is an unquoted JWT
  // served as text/html. Wrapping it in res.json() would add quotes and silently
  // break any client that uses the body directly as a header value.
  it("POST /api/sparklers/quick", async () => {
    const email = unique("quick");
    const res = await api()
      .post("/api/sparklers/quick")
      .send({ idToken: firebaseIdTokenFor(email), email, name: "Contract User" });

    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
    expect(res.text).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(res.text.startsWith('"')).toBe(false);
    expect(res.headers["x-auth-token"]).toBe(res.text);
  });

  it("the JWT carries a feedToken for its own user, and nothing else in custom", async () => {
    // CHANGED IN THE CLIENT TRIM (was absent): both clients connect Stream
    // Feeds and Chat with custom.feedToken straight out of the JWT.
    const email = unique("claims");
    const res = await api()
      .post("/api/sparklers/quick")
      .send({ idToken: firebaseIdTokenFor(email), email, name: "Claims" });
    const claims = jwt.decode(res.text) as {
      id: string;
      exp?: number;
      custom: Record<string, unknown>;
    };

    expect(Object.keys(claims.custom).sort()).toEqual([
      "feedToken",
      "isAdmin",
      "username",
      "verified",
    ]);
    expect(claims.exp).toBeUndefined();
    const feed = jwt.decode(claims.custom.feedToken as string) as { user_id: string; exp?: number };
    expect(feed.user_id).toBe(claims.id);
    // Permanent on purpose: clients reuse the cached JWT without checking exp.
    expect(feed.exp).toBeUndefined();

    // Minted, never stored.
    const stored = await Sparkler().findById(claims.id).lean<StoredUser>();
    expect(stored?.custom.feedToken).toBeUndefined();
  });

  it("x-auth-token IS exposed to browsers", async () => {
    // CHANGED IN PHASE 3 (was absent): cors now sets exposedHeaders, so a
    // browser client can finally read the header the API tells it to read.
    const email = unique("cors");
    const res = await api()
      .post("/api/sparklers/quick")
      .send({ idToken: firebaseIdTokenFor(email), email, name: "Cors" });
    expect(res.headers["access-control-expose-headers"]).toContain("x-auth-token");
  });
});

describe("first sign-in (email not in the database)", () => {
  const quick = (body: Record<string, unknown>) => {
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const idToken =
      typeof body.idToken === "string"
        ? body.idToken
        : email
          ? firebaseIdTokenFor(email)
          : undefined;
    return api()
      .post("/api/sparklers/quick")
      .send({ ...body, idToken });
  };
  const claimsOf = (token: string) =>
    jwt.decode(token) as { id: string; name: string; custom: { username: string } };

  it("creates exactly one account and signs the user into it", async () => {
    const email = unique("first");
    const res = await quick({ email, name: "Grace Hopper" });
    expect(res.status).toBe(200);

    const stored = await Sparkler().find({ email }).lean<(StoredUser & { _id: unknown; image: string })[]>();
    expect(stored).toHaveLength(1);
    expect(String(stored[0]?._id)).toBe(claimsOf(res.text).id);
    expect(stored[0]?.custom.username).toBe("gracehopper");
    expect(stored[0]?.image).toBe("");
  });

  it("uses the verified Firebase email instead of a caller-supplied email", async () => {
    const verifiedEmail = unique("verified");
    const claimedEmail = unique("claimed");
    const claimedAccount = await Sparkler().create({
      email: claimedEmail,
      name: "Claimed Account",
      custom: { username: "claimed-account" },
    });
    const res = await quick({
      idToken: firebaseIdTokenFor(verifiedEmail),
      email: claimedEmail,
      name: "Verified identity",
    });

    expect(res.status).toBe(200);
    expect(await Sparkler().countDocuments({ email: verifiedEmail })).toBe(1);
    expect(claimsOf(res.text).id).not.toBe(String(claimedAccount._id));
    expect(await Sparkler().countDocuments({ email: claimedEmail })).toBe(1);
  });

  it("creates a new account from the verified identity profile when profile fields are omitted", async () => {
    const email = unique("Firebase.Profile").replace("@", "@Example.");
    verifyFirebaseIdTokenMock.mockResolvedValueOnce({
      id: "firebase-profile-user",
      email,
      name: "Firebase Profile",
      image: "https://example.com/firebase-profile.jpg",
    });

    const res = await quick({ idToken: firebaseIdTokenFor(email) });

    expect(res.status).toBe(200);
    const claims = claimsOf(res.text);
    expect(claims.name).toBe("Firebase Profile");
    const stored = await Sparkler()
      .findById(claims.id)
      .lean<StoredUser & { email: string; image: string }>();
    expect(stored?.email).toBe(email);
    expect(stored?.name).toBe("Firebase Profile");
    expect(stored?.image).toBe("https://example.com/firebase-profile.jpg");
  });

  it("authenticates an existing email match without using request profile fields", async () => {
    const email = unique("existing").replace("@", "@Example.");
    const existing = await Sparkler().create({
      email,
      name: "Stored Name",
      image: "https://example.com/stored.jpg",
      custom: { username: "stored-name" },
    });
    const res = await quick({
      idToken: firebaseIdTokenFor(email.toLowerCase()),
      name: 42,
      image: "https://example.com/attacker.jpg",
    });

    expect(res.status).toBe(200);
    expect(claimsOf(res.text).id).toBe(String(existing._id));
    expect(claimsOf(res.text).name).toBe("Stored Name");
    const stored = await Sparkler().findById(existing._id).lean<StoredUser & { image: string }>();
    expect(stored?.name).toBe("Stored Name");
    expect(stored?.image).toBe("https://example.com/stored.jpg");
  });

  it("never uses a request-body email object as a Mongo query", async () => {
    const verifiedEmail = unique("verified-operator");
    const res = await quick({
      idToken: firebaseIdTokenFor(verifiedEmail),
      email: { $ne: null },
      name: "Verified identity",
    });

    expect(res.status).toBe(200);
    expect(await Sparkler().countDocuments({ email: verifiedEmail })).toBe(1);
  });

  it("concurrent first sign-ins for one email all succeed, as one account", async () => {
    // Clients can fire /quick twice at once (auth listener + screen effect).
    const email = unique("race");
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => quick({ email, name: "Race Condition" })),
    );

    expect(responses.map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
    expect(new Set(responses.map((r) => claimsOf(r.text).id)).size).toBe(1);
    expect(await Sparkler().countDocuments({ email })).toBe(1);
    await vi.waitFor(() => expect(mailsTo(email)).toHaveLength(1));
  });

  it("a taken username gets a numeric suffix", async () => {
    const first = await quick({ email: unique("dup"), name: "Same Name" });
    const second = await quick({ email: unique("dup"), name: "Same Name" });

    expect(second.status).toBe(200);
    expect(claimsOf(second.text).custom.username).toMatch(/^samename\d{3}$/);
    expect(claimsOf(second.text).custom.username).not.toBe(claimsOf(first.text).custom.username);
  });

  it("surrounding whitespace in the email does not create a second account", async () => {
    const email = unique("trim");
    const a = await quick({ email, name: "Trim" });
    const b = await quick({ email: `  ${email} `, name: "Trim" });

    expect(b.status).toBe(200);
    expect(claimsOf(b.text).id).toBe(claimsOf(a.text).id);
  });

  it("a null image is accepted", async () => {
    expect((await quick({ email: unique("img"), name: "Img", image: null })).status).toBe(200);
  });

  it.each([
    ["a numeric name", { email: "n@example.com", name: 42 }],
    ["a whitespace-only name", { email: "ws@example.com", name: "   " }],
  ])("%s -> 400", async (_label, body) => {
    const res = await quick(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("Name must be a non-empty string");
  });
});

describe("profile updates", () => {
  it("PATCH writes whitelisted profile fields and ignores permission flags", async () => {
    // CHANGED IN THE CLIENT TRIM (only name/image/username were saved): the
    // profile fields are writable. Mobile sends its whole stored custom back,
    // so isAdmin/verified/feedToken in the body must be ignored.
    const { id, token } = await createUser({ username: "before" });
    const res = await api()
      .patch("/api/sparklers")
      .set("x-auth-token", token)
      .send({
        name: "After",
        custom: {
          username: "after-name",
          bio: "New bio",
          isProfilePrivate: true,
          isAdmin: true,
          verified: true,
          feedToken: "x",
        },
      });

    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
    expect(res.headers["x-auth-token"]).toBe(res.text);

    const stored = await Sparkler().findById(id).lean<StoredUser>();
    expect(stored?.name).toBe("After");
    expect(stored?.custom).toMatchObject({
      username: "after-name",
      bio: "New bio",
      isProfilePrivate: true,
    });
    expect(stored?.custom.isAdmin).toBeUndefined();
    expect(stored?.custom.verified).toBeUndefined();
    expect(stored?.custom.feedToken).toBeUndefined();

    const refreshedClaims = jwt.decode(res.text) as { name: string; custom: { username: string } };
    expect(refreshedClaims.name).toBe("After");
    expect(refreshedClaims.custom.username).toBe("after-name");
  });

  it("PATCH persists and returns a named location with validated coordinates", async () => {
    const { id, token } = await createUser({ username: "location-user" });
    const location = {
      name: "University of Nairobi, Nairobi, Kenya",
      coords: { lat: -1.2864, lng: 36.8172 },
      precision: "precise",
    };

    const saved = await api()
      .patch("/api/sparklers")
      .set("x-auth-token", token)
      .send({ custom: { location } });

    expect(saved.status).toBe(200);
    const stored = await Sparkler().findById(id).lean<StoredUser>();
    expect(stored?.custom.location).toEqual(location);

    const reloaded = await api().get(`/api/sparklers/${id}`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.body.custom.location).toEqual(location);
  });

  it("rejects out-of-range profile coordinates without saving them", async () => {
    const { id, token } = await createUser({ username: "invalid-location" });
    const res = await api()
      .patch("/api/sparklers")
      .set("x-auth-token", token)
      .send({
        custom: { location: { name: "Nairobi", coords: { lat: 91, lng: 36 } } },
      });

    expect(res.status).toBe(400);
    const stored = await Sparkler().findById(id).lean<StoredUser>();
    expect(stored?.custom.location).toBeUndefined();
  });

  it("rejects a profile location name that exceeds the mobile field limit", async () => {
    const { token } = await createUser({ username: "long-location" });
    const res = await api()
      .patch("/api/sparklers")
      .set("x-auth-token", token)
      .send({ custom: { location: { name: "x".repeat(81) } } });

    expect(res.status).toBe(400);
  });

  it("PATCH with another user's username -> 409; re-sending your own is fine", async () => {
    await createUser({ username: "taken-name" });
    const { token } = await createUser({ username: "mine" });

    const clash = await api()
      .patch("/api/sparklers")
      .set("x-auth-token", token)
      .send({ custom: { username: "taken-name" } });
    expect(clash.status).toBe(409);

    const same = await api()
      .patch("/api/sparklers")
      .set("x-auth-token", token)
      .send({ custom: { username: "mine" } });
    expect(same.status).toBe(200);
  });

  it("PATCH /:id edits only the caller's own record", async () => {
    const me = await createUser();
    const other = await createUser();

    const forbidden = await api()
      .patch(`/api/sparklers/${other.id}`)
      .set("x-auth-token", me.token)
      .send({ name: "Hijack" });
    expect(forbidden.status).toBe(403);

    const own = await api()
      .patch(`/api/sparklers/${me.id}`)
      .set("x-auth-token", me.token)
      .send({ custom: { website: "https://me.example" } });
    expect(own.status).toBe(200);
  });

  it("DELETE removes the caller and their push token", async () => {
    const { id, token } = await createUser();
    await api()
      .post("/api/pushTokens")
      .set("x-auth-token", token)
      .send({ pushToken: "ExponentPushToken[x]" });

    const res = await api().delete("/api/sparklers").set("x-auth-token", token);
    expect(res.status).toBe(200);
    expect(await Sparkler().findById(id)).toBeNull();
    expect(await mongoose.model("PushToken").findOne({ userId: id })).toBeNull();
  });
});

describe("mails (admin)", () => {
  let adminToken: string;

  beforeAll(async () => {
    adminToken = (await createUser({ isAdmin: true })).token;
  });

  it("POST /preview renders the announcement without sending", async () => {
    const res = await api().post("/api/mails/preview").set("x-auth-token", adminToken).send({
      subject: "News",
      heading: "Hello",
      message: "<b>Bold</b> news",
      ctaLabel: "Open",
      ctaUrl: "https://sparkler.website/",
    });

    expect(res.status).toBe(200);
    expect(res.type).toBe("text/html");
    expect(res.text).toContain("&lt;b&gt;Bold&lt;/b&gt;");
    expect(res.text).toContain('href="https://sparkler.website/"');
  });

  it.each([
    [{ message: "no subject" }, "Subject and message are required"],
    [
      { subject: "s", message: "m", ctaLabel: "Open" },
      "ctaLabel and ctaUrl must be provided together",
    ],
    [
      { subject: "s", message: "m", ctaLabel: "Open", ctaUrl: "javascript:alert(1)" },
      "ctaUrl must be an https:// URL",
    ],
  ])("rejects %j with 400", async (body, error) => {
    const res = await api().post("/api/mails/preview").set("x-auth-token", adminToken).send(body);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(error);
  });
});

describe("account emails", () => {
  // Sent in the background, so each test waits for the outbox to fill.
  it("a new account gets one welcome email; signing in again sends nothing", async () => {
    const email = unique("welcome");
    const payload = { idToken: firebaseIdTokenFor(email), email, name: "Ada Lovelace" };
    await api().post("/api/sparklers/quick").send(payload);
    await vi.waitFor(() => expect(mailsTo(email)).toHaveLength(1));
    expect(mailsTo(email)[0]?.subject).toBe("Welcome to Sparkler, Ada");

    await api().post("/api/sparklers/quick").send(payload);
    await new Promise((r) => setTimeout(r, 50));
    expect(mailsTo(email)).toHaveLength(1);
  });

  it("PATCH /verify emails only users who were not already verified", async () => {
    const adminToken = (await createUser({ isAdmin: true })).token;
    const fresh = unique("verify");
    const already = unique("already");
    await Sparkler().create({ email: fresh, name: "Fresh", custom: {} });
    await Sparkler().create({ email: already, name: "Already", custom: { verified: true } });

    const verify = () =>
      api()
        .patch("/api/sparklers/verify")
        .set("x-auth-token", adminToken)
        .send({ emails: [fresh, already] });

    expect((await verify()).status).toBe(200);
    await vi.waitFor(() => expect(mailsTo(fresh)).toHaveLength(1));
    expect(mailsTo(fresh)[0]?.subject).toBe("You're verified on Sparkler");

    // Running the same list again mails nobody.
    await verify();
    await new Promise((r) => setTimeout(r, 50));
    expect(mailsTo(fresh)).toHaveLength(1);
    expect(mailsTo(already)).toHaveLength(0);
  });

  it("DELETE sends a confirmation to the deleted account", async () => {
    const user = await Sparkler().create({ email: unique("gone"), name: "Gone", custom: {} });
    await api()
      .delete("/api/sparklers")
      .set("x-auth-token", userToken(user._id.toString()));

    await vi.waitFor(() => expect(mailsTo(user.email)).toHaveLength(1));
    expect(mailsTo(user.email)[0]?.subject).toBe("Your Sparkler account has been deleted");
    expect(mailsTo(user.email)[0]?.text).toContain("last email");
  });
});

describe("reserved usernames", () => {
  it("refuses a name a page already lives at, whatever its case", async () => {
    const { token } = await createUser({ username: "before-reserved" });
    const res = await api()
      .patch("/api/sparklers")
      .set("x-auth-token", token)
      .send({ custom: { username: "About" } });
    expect(res.status).toBe(409);
  });

  it("never generates one at sign-up", async () => {
    const username = await findUniqueUsername("Ab out");
    expect(username).toMatch(/^about\d{3}$/);
  });

  it("gives a blank name a username rather than none", async () => {
    expect(await findUniqueUsername("  ")).toMatch(/^sparkler/);
  });
});
