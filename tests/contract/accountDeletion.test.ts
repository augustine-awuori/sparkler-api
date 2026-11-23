import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { Sparkler } from "../../src/models/sparkler.js";

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: async () => ({ data: { id: "t" }, error: null }) };
    batch = { send: async () => ({ data: { data: [] }, error: null }) };
  },
}));

const stream = vi.hoisted(() => {
  const calls: string[] = [];
  return {
    calls,
    feeds: {
      deleteFeedUserData: vi.fn(
        async () => (calls.push("feeds"), { task_id: "t1" }),
      ),
    },
    deleteUsers: vi.fn(async () => (calls.push("user"), { task_id: "t2" })),
  };
});
vi.mock("../../src/services/stream.js", async (original) => ({
  ...(await original<object>()),
  streamClient: () => stream,
}));

let app: Application;
let count = 0;

async function deleteAnAccount() {
  count += 1;
  const user = await new Sparkler({
    email: `delete-${count}-${Date.now()}@example.com`,
    name: "Ada Lovelace",
    custom: { username: `delete${count}${Date.now()}` },
  }).save();
  const id = user._id.toString();
  const token = jwt.sign(
    { id, custom: {} },
    process.env.jwtPrivateKey as string,
  );
  const res = await request(app)
    .delete("/api/sparklers")
    .set("x-auth-token", token);
  return { id, res };
}

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(() => {
  vi.clearAllMocks();
  stream.calls.length = 0;
});

/**
 * Play Console, 2026-11-22: the account deletion page must say what deleting an
 * account removes. Stream erases feeds data apart from the user, and only the
 * user was being deleted.
 */
describe("DELETE /api/sparklers", () => {
  it("erases the account's sparkles, replies, reactions and follows for good", async () => {
    const { id, res } = await deleteAnAccount();

    expect(res.status).toBe(200);
    expect(stream.feeds.deleteFeedUserData).toHaveBeenCalledWith({
      user_id: id,
      hard_delete: true,
    });
  });

  it("erases the feeds data before the Stream user it belongs to", async () => {
    const { id } = await deleteAnAccount();

    expect(stream.deleteUsers).toHaveBeenCalledWith({
      user_ids: [id],
      user: "hard",
    });
    expect(stream.calls).toEqual(["feeds", "user"]);
  });

  it("still deletes the account and the Stream user when Stream refuses the feeds data", async () => {
    stream.feeds.deleteFeedUserData.mockRejectedValueOnce(
      new Error("Stream is down"),
    );
    const { id, res } = await deleteAnAccount();

    expect(res.body).toEqual({ success: true });
    expect(await Sparkler.findById(id)).toBeNull();
    expect(stream.deleteUsers).toHaveBeenCalledWith({
      user_ids: [id],
      user: "hard",
    });
  });
});
