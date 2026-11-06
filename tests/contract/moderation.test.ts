import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { Sparkler } from "../../src/models/sparkler.js";

const stream = vi.hoisted(() => ({
  queryReviewQueue: vi.fn(),
  submitAction: vi.fn(async () => ({})),
}));
vi.mock("../../src/services/stream.js", async (original) => ({
  ...(await original<object>()),
  streamClient: () => ({ moderation: stream }),
}));

let app: Application;
let count = 0;

async function aUser(custom: Record<string, unknown> = {}) {
  count += 1;
  const user = await new Sparkler({
    email: `mod-${count}-${Date.now()}@example.com`,
    custom: { username: `mod${count}${Date.now()}`, ...custom },
  }).save();
  const id = user._id.toString();
  const token = jwt.sign({ id, custom: {} }, process.env.jwtPrivateKey as string);
  return {
    id,
    get: (path: string) => request(app).get(`/api/moderation${path}`).set("x-auth-token", token),
    post: (path: string, body: object) =>
      request(app).post(`/api/moderation${path}`).set("x-auth-token", token).send(body),
  };
}

const REPORTED = {
  id: "item-1",
  entity_id: "activity-1",
  entity_type: "stream:feeds:v3:activity",
  entity_creator_id: "author-1",
  flags_count: 2,
  created_at: new Date("2026-11-06T10:00:00.000Z"),
  flags: [{ reason: "spam" }, { reason: "spam" }, { reason: "harassment" }],
  activity: { text: "Buy my notes" },
};

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(() => {
  stream.queryReviewQueue.mockReset();
  stream.submitAction.mockClear();
  stream.queryReviewQueue.mockResolvedValue({ items: [REPORTED], next: "page-2" });
});

describe("the review queue", () => {
  it("is for admins only", async () => {
    const student = await aUser();
    expect((await student.get("/queue")).status).toBe(403);
    expect((await request(app).get("/api/moderation/queue")).status).toBe(401);
    expect(stream.queryReviewQueue).not.toHaveBeenCalled();
    expect(
      (await student.post("/queue/item-1/decision", { decision: "remove", kind: "sparkle" })).status,
    ).toBe(403);
    expect(stream.submitAction).not.toHaveBeenCalled();
  });

  it("lists what's waiting, with the reasons once each", async () => {
    const admin = await aUser({ isAdmin: true });
    const { status, body } = await admin.get("/queue");
    expect(status).toBe(200);
    expect(body.next).toBe("page-2");
    expect(body.items[0]).toMatchObject({
      id: "item-1",
      kind: "sparkle",
      entityId: "activity-1",
      authorId: "author-1",
      flagCount: 2,
      reasons: ["spam", "harassment"],
      text: "Buy my notes",
    });
    expect(stream.queryReviewQueue.mock.calls[0]?.[0].filter.reviewed).toBe(false);
  });

  it.each([
    ["keep", "sparkle", "mark_reviewed"],
    ["remove", "sparkle", "delete_activity"],
    ["remove", "reply", "delete_comment"],
  ])("%s on a %s asks Stream to %s", async (decision, kind, action_type) => {
    const admin = await aUser({ isAdmin: true });
    const { status } = await admin.post("/queue/item-1/decision", { decision, kind });
    expect(status).toBe(200);
    expect(stream.submitAction).toHaveBeenCalledWith(
      expect.objectContaining({ item_id: "item-1", user_id: admin.id, action_type }),
    );
  });

  it("refuses a decision it doesn't know", async () => {
    const admin = await aUser({ isAdmin: true });
    const { status } = await admin.post("/queue/item-1/decision", { decision: "ban", kind: "sparkle" });
    expect(status).toBe(400);
    expect(stream.submitAction).not.toHaveBeenCalled();
  });
});
