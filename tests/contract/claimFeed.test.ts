import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";

const feeds = vi.hoisted(() => ({ getOrCreateFeed: vi.fn(), updateFeed: vi.fn() }));

vi.mock("../../src/services/stream.js", async (original) => ({
  ...(await original<object>()),
  streamClient: () => ({ feeds }),
}));

const ID = "64b000000000000000000001";
let app: Application;

const claim = () =>
  request(app)
    .post("/api/sparklers/claim-feed")
    .set("x-auth-token", jwt.sign({ id: ID, custom: {} }, process.env.jwtPrivateKey as string));

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(() => vi.clearAllMocks());

describe("POST /api/sparklers/claim-feed", () => {
  it("hands a mis-owned feed to the caller, and only the caller", async () => {
    feeds.getOrCreateFeed.mockResolvedValue({ feed: { created_by: { id: "guest" } } });
    const res = await claim().send({ userId: "someone-else" });
    expect(res.body).toEqual({ claimed: true });
    expect(feeds.updateFeed).toHaveBeenCalledWith({
      feed_group_id: "user",
      feed_id: ID,
      created_by_id: ID,
    });
  });

  it("writes nothing when the feed is already theirs", async () => {
    feeds.getOrCreateFeed.mockResolvedValue({ feed: { created_by: { id: ID } } });
    expect((await claim()).body).toEqual({ claimed: true });
    expect(feeds.updateFeed).not.toHaveBeenCalled();
  });

  it("says so when Stream fails", async () => {
    feeds.getOrCreateFeed.mockRejectedValue(new Error("down"));
    expect((await claim()).body).toEqual({ claimed: false });
  });

  it("needs a signed-in caller", async () => {
    expect((await request(app).post("/api/sparklers/claim-feed")).status).toBe(401);
  });
});
