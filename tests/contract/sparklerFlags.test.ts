import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { Developer } from "../../src/models/developer.js";
import { Sparkler } from "../../src/models/sparkler.js";

type SentMail = { to: string; subject: string };
const outbox = vi.hoisted(() => [] as SentMail[]);
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async (mail: SentMail) => (outbox.push(mail), { data: { id: "t" }, error: null }) };
    batch = {
      send: async (mails: SentMail[]) => (outbox.push(...mails), { data: { data: [] }, error: null }),
    };
  },
}));

const stream = vi.hoisted(() => ({ upsertUsers: vi.fn(async () => ({})) }));
vi.mock("../../src/services/stream.js", async (original) => ({
  ...(await original<object>()),
  streamClient: () => stream,
}));

let app: Application;
let count = 0;

async function aUser(custom: Record<string, unknown> = {}) {
  count += 1;
  const email = `flags-${count}-${Date.now()}@example.com`;
  const user = await new Sparkler({
    email,
    name: "Grace Hopper",
    custom: { username: `flags${count}${Date.now()}`, ...custom },
  }).save();
  const id = user._id.toString();
  const token = jwt.sign({ id, custom: { isAdmin: true } }, process.env.jwtPrivateKey as string);
  const patch = (path: string, body: object) =>
    request(app).patch(`/api/sparklers${path}`).set("x-auth-token", token).send(body);
  return { id, email, patch };
}

const flagsOf = async (id: string) => (await Sparkler.findById(id).lean())?.custom;
const mailsTo = (email: string) => outbox.filter((mail) => mail.to === email);

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(() => {
  stream.upsertUsers.mockReset();
  stream.upsertUsers.mockResolvedValue({});
});

describe("PATCH /api/sparklers/:id/verified", () => {
  it("lets an admin verify and unverify someone, keeping their other custom keys", async () => {
    const admin = await aUser({ isAdmin: true });
    const target = await aUser({ bio: "hello" });

    const verified = await admin.patch(`/${target.id}/verified`, { verified: true });
    expect(verified.status).toBe(200);
    expect(verified.body).toMatchObject({ id: target.id, custom: { verified: true } });
    expect(verified.body.email).toBeUndefined();
    expect(await flagsOf(target.id)).toMatchObject({ verified: true, bio: "hello" });

    const unverified = await admin.patch(`/${target.id}/verified`, { verified: false });
    expect(unverified.body.custom.verified).toBe(false);
    expect(await flagsOf(target.id)).toMatchObject({ verified: false, bio: "hello" });
  });

  it("mails the person only the first time they are verified", async () => {
    const admin = await aUser({ isAdmin: true });
    const target = await aUser();

    await admin.patch(`/${target.id}/verified`, { verified: true });
    await vi.waitFor(() => expect(mailsTo(target.email)).toHaveLength(1));
    expect(mailsTo(target.email)[0]?.subject).toBe("You're verified on Sparkler");

    await admin.patch(`/${target.id}/verified`, { verified: true });
    await admin.patch(`/${target.id}/verified`, { verified: false });
    await new Promise((r) => setTimeout(r, 50));
    expect(mailsTo(target.email)).toHaveLength(1);
  });

  it("pushes the new flag to Stream, and still succeeds when Stream is down", async () => {
    const admin = await aUser({ isAdmin: true });
    const target = await aUser();

    await admin.patch(`/${target.id}/verified`, { verified: true });
    expect(stream.upsertUsers).toHaveBeenCalledWith([
      expect.objectContaining({ id: target.id, custom: expect.objectContaining({ verified: true }) }),
    ]);

    stream.upsertUsers.mockRejectedValue(new Error("Stream is down"));
    expect((await admin.patch(`/${target.id}/verified`, { verified: false })).status).toBe(200);
    expect((await flagsOf(target.id))?.verified).toBe(false);
  });

  it("is for admins only, whatever the token claims", async () => {
    const student = await aUser();
    const target = await aUser();
    expect((await student.patch(`/${target.id}/verified`, { verified: true })).status).toBe(403);
    expect(
      (await request(app).patch(`/api/sparklers/${target.id}/verified`).send({ verified: true })).status,
    ).toBe(401);
    expect((await flagsOf(target.id))?.verified).toBeUndefined();
  });

  it.each([[{}], [{ verified: "true" }], [{ verified: 1 }]])("rejects %j with 400", async (body) => {
    const admin = await aUser({ isAdmin: true });
    const target = await aUser();
    expect((await admin.patch(`/${target.id}/verified`, body)).status).toBe(400);
  });

  it("answers 404 for someone who doesn't exist", async () => {
    const admin = await aUser({ isAdmin: true });
    expect((await admin.patch("/000000000000000000000000/verified", { verified: true })).status).toBe(404);
    expect((await admin.patch("/not-an-id/verified", { verified: true })).status).toBe(404);
  });
});

describe("PATCH /api/sparklers/:id/admin", () => {
  it("lets an admin grant and take away admin", async () => {
    const admin = await aUser({ isAdmin: true });
    const target = await aUser({ verified: true });

    const granted = await admin.patch(`/${target.id}/admin`, { isAdmin: true });
    expect(granted.status).toBe(200);
    expect(granted.body.custom).toMatchObject({ isAdmin: true, verified: true });

    const revoked = await admin.patch(`/${target.id}/admin`, { isAdmin: false });
    expect(revoked.body.custom.isAdmin).toBe(false);
    expect(await flagsOf(target.id)).toMatchObject({ isAdmin: false, verified: true });
  });

  it("removes their error-tracker access when admin is taken away", async () => {
    const admin = await aUser({ isAdmin: true });
    const target = await aUser({ isAdmin: true });
    await Developer.create({
      sparklerId: target.id,
      name: "Grace Hopper",
      email: target.email,
      role: "admin",
      status: "active",
      requestedAt: new Date(),
    });

    await admin.patch(`/${target.id}/admin`, { isAdmin: false });

    expect(await Developer.findOne({ sparklerId: target.id }).lean()).toMatchObject({
      status: "removed",
      role: "developer",
    });
  });

  it("won't let an admin change their own admin status", async () => {
    const admin = await aUser({ isAdmin: true });
    const res = await admin.patch(`/${admin.id}/admin`, { isAdmin: false });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("You can't change your own access");
    expect((await flagsOf(admin.id))?.isAdmin).toBe(true);
  });

  it("is for admins only, whatever the token claims", async () => {
    const student = await aUser();
    const target = await aUser();
    expect((await student.patch(`/${target.id}/admin`, { isAdmin: true })).status).toBe(403);
    expect((await flagsOf(target.id))?.isAdmin).toBeUndefined();
  });

  it("rejects a non-boolean isAdmin with 400", async () => {
    const admin = await aUser({ isAdmin: true });
    const target = await aUser();
    expect((await admin.patch(`/${target.id}/admin`, { isAdmin: "yes" })).status).toBe(400);
  });
});
