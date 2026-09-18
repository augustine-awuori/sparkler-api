/**
 * Wire-contract baseline.
 *
 * Records what the API returns TODAY, before the TypeScript migration moves any
 * code. Its job is to fail loudly if a refactor changes bytes a client can see.
 *
 * Expectations that encode a KNOWN BUG are marked `// FIXED IN PHASE n`. When
 * that phase lands, the expectation is edited in the same commit — which makes
 * the behaviour-change ledger reviewable as a diff rather than a prose list.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";

let app: Application;
let api: () => request.Agent;

const userToken = (id: string, custom: Record<string, unknown> = {}) =>
  jwt.sign({ id, name: "Contract", custom }, process.env.jwtPrivateKey as string);

beforeAll(async () => {
  const config = loadConfig();
  await connectDb(config.databaseUrl);
  app = createApp();
  api = () => request(app);
  expect(mongoose.connection.readyState).toBe(1);
});

afterAll(async () => {
  await disconnectDb();
});

describe("unauthenticated reads", () => {
  it.each([
    ["/api/schools", 200, "array"],
    ["/api/communities", 200, "array"],
    ["/api/bugs", 200, "array"],
    ["/api/alumnis", 200, "array"],
    ["/api/departments", 200, "array"],
    ["/api/programmes", 200, "array"],
    ["/api/verifications", 200, "array"], // FIXED IN PHASE 6 — will require auth
  ])("GET %s -> %i, %s body", async (path, status, shape) => {
    const res = await api().get(path);
    expect(res.status).toBe(status);
    expect(Array.isArray(res.body)).toBe(shape === "array");
    expect(res.type).toBe("application/json");
  });

  it("GET /api/alumnis/count returns a bare {count}", async () => {
    const res = await api().get("/api/alumnis/count");
    expect(res.status).toBe(200);
    expect(Object.keys(res.body)).toEqual(["count"]);
    expect(typeof res.body.count).toBe("number");
  });
});

describe("auth gating", () => {
  const unauthenticated: ReadonlyArray<[string, () => request.Test]> = [
    ["GET /api/sparklers", () => api().get("/api/sparklers")],
    ["GET /api/sparklers/feed-token", () => api().get("/api/sparklers/feed-token")],
    ["PATCH /api/sparklers", () => api().patch("/api/sparklers")],
    ["POST /api/pushTokens", () => api().post("/api/pushTokens")],
    ["GET /api/reports", () => api().get("/api/reports")],
  ];

  it.each(unauthenticated)("%s without a token -> 401", async (_label, call) => {
    const res = await call();
    expect(res.status).toBe(401);
    expect(typeof res.body.error).toBe("string");
  });

  it("a malformed token -> 401", async () => {
    // CHANGED IN THE TS PORT (was 400): routes now use authenticate() instead
    // of the legacy middlewares/auth.js, which answered 400 for a bad token.
    const res = await api().get("/api/sparklers").set("x-auth-token", "garbage");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid token. User doesn't exist");
  });

  it("admin-only routes reject a non-admin with 403", async () => {
    const res = await api()
      .patch("/api/sparklers/sync")
      .set("x-auth-token", userToken(new mongoose.Types.ObjectId().toString()));
    expect(res.status).toBe(403);
  });
});

describe("error body shape", () => {
  it("`error` is a top-level string — clients read body.error", async () => {
    const res = await api().post("/api/sparklers/quick").send({});
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe("string");
    expect(res.body.error).toBe("Name and email are required");
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
  it.each(["/api/sparklers/quick", "/api/sparklers/auth-google"])(
    "POST %s",
    async (path) => {
      const email = `contract${Date.now()}${path.replace(/\W/g, "")}@example.com`;
      const res = await api().post(path).send({ email, name: "Contract User" });

      expect(res.status).toBe(200);
      expect(res.type).toBe("text/html");
      expect(res.text).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(res.text.startsWith('"')).toBe(false);
      expect(res.headers["x-auth-token"]).toBe(res.text);
    },
  );

  it("x-auth-token IS exposed to browsers", async () => {
    // CHANGED IN PHASE 3 (was absent): cors now sets exposedHeaders, so a
    // browser client can finally read the header the API tells it to read.
    const res = await api()
      .post("/api/sparklers/quick")
      .send({ email: `cors${Date.now()}@example.com`, name: "Cors" });
    expect(res.headers["access-control-expose-headers"]).toContain("x-auth-token");
  });
});

describe("known-broken endpoints (each fixed in a later phase)", () => {
  it("POST /api/chatToken reads req.user.id", async () => {
    // CHANGED IN THE TS PORT (was 500 on every call): it read req.user._id,
    // which the token payload never has. An unknown user now gets the route's
    // own 404, and a real one gets a bare chat token plus a fresh x-auth-token.
    const unknown = await api()
      .post("/api/chatToken")
      .set("x-auth-token", userToken(new mongoose.Types.ObjectId().toString()));
    expect(unknown.status).toBe(404);

    const Sparkler = mongoose.model("Sparkler");
    const user = await Sparkler.create({ email: `chat${Date.now()}@example.com`, name: "Chat" });
    const res = await api()
      .post("/api/chatToken")
      .set("x-auth-token", userToken(user._id.toString()));
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^eyJ[\w-]+\.[\w-]+\.[\w-]+$/);
    expect(typeof res.headers["x-auth-token"]).toBe("string");
  });

  it("GET /api/communities/levels is shadowed by GET /:communityId", async () => {
    // FIXED IN PHASE 6 — declared before the parameterised route.
    // CHANGED IN PHASE 3 (was 500): "levels" is still fed to findById as an
    // id, but toAppError now maps the CastError to a 400 instead of letting
    // Express's default handler answer with a 500. Route ordering is fixed in
    // Phase 6, which will make this a real 200.
    const res = await api().get("/api/communities/levels");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("bad_request");
  });

  it("GET /api/reports admits an admin and rejects everyone else", async () => {
    // CHANGED IN THE TS PORT (was 403 for everyone): isAuthorised read
    // user.isAdmin, but the flag lives under custom.isAdmin.
    const Sparkler = mongoose.model("Sparkler");
    const admin = await Sparkler.create({
      email: `admin${Date.now()}@example.com`,
      name: "Admin",
      custom: { isAdmin: true },
    });
    const res = await api()
      .get("/api/reports")
      .set("x-auth-token", userToken(admin._id.toString(), { isAdmin: true }));
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);

    // The token's claim is not trusted — only the database flag is.
    const nobody = await api()
      .get("/api/reports")
      .set("x-auth-token", userToken(new mongoose.Types.ObjectId().toString(), { isAdmin: true }));
    expect(nobody.status).toBe(403);
  });

  it("POST /api/reports accepts an unauthenticated write", async () => {
    // FIXED IN PHASE 6 — will require auth.
    const res = await api()
      .post("/api/reports")
      .send({ title: "Contract", description: "baseline probe" });
    expect(res.status).toBe(200);
  });
});
