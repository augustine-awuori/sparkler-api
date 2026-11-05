import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { PushAnnouncement } from "../../src/models/pushAnnouncement.js";
import { PushToken } from "../../src/models/pushToken.js";
import { MAX_ANONYMOUS_PER_HOUR } from "../../src/services/sparkleAnnouncement.js";

const stream = vi.hoisted(() => ({
  getBlockedUsers: vi.fn(),
  queryUsers: vi.fn(),
  feeds: { getActivity: vi.fn(), queryFollows: vi.fn() },
}));
const send = vi.hoisted(() => vi.fn(async () => undefined));

vi.mock("../../src/services/stream.js", async (original) => ({
  ...(await original<object>()),
  streamClient: () => stream,
}));
vi.mock("../../src/utils/pushNotifications.js", async (original) => ({
  ...(await original<object>()),
  sendPushNotificationTo: send,
}));

let app: Application;

const newId = () => new mongoose.Types.ObjectId().toString();
const tokenFor = (id: string) =>
  jwt.sign({ id, name: "Test", custom: {} }, process.env.jwtPrivateKey as string);
const deviceOf = (id: string) => `ExponentPushToken[${id}]`;

async function withDevice(id = newId()): Promise<string> {
  await PushToken.create({ userId: id, pushToken: deviceOf(id) });
  return id;
}

function activity(authorId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: "activity-1",
    text: "Hello\n\ncampus",
    visibility: "public",
    custom: {},
    mentioned_users: [],
    user: { id: authorId, name: "Kai", custom: { username: "kai" } },
    ...overrides,
  };
}

const followFrom = (id: string, preference = "") => ({
  push_preference: preference,
  // No `created_by`: the follower must come from the feed's own id.
  source_feed: { id },
});

/** Sending carries on after the response, and can take a moment against a real Mongo. */
const sent = () => vi.waitFor(() => expect(send).toHaveBeenCalled(), { timeout: 20_000 });

const lastSend = () => send.mock.lastCall as unknown as [string[], Record<string, unknown>];

const announce = (authorId: string, activityId = "activity-1") =>
  request(app)
    .post("/api/pushTokens/sparkle")
    .set("x-auth-token", tokenFor(authorId))
    .send({ activityId });

const sendToMany = (senderId: string, userIds: unknown[]) =>
  request(app)
    .post("/api/pushTokens/send-to-many")
    .set("x-auth-token", tokenFor(senderId))
    .send({ userIds, message: "Hi", title: "Kai" });

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  await PushToken.syncIndexes();
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(async () => {
  vi.clearAllMocks();
  stream.getBlockedUsers.mockResolvedValue({ blocks: [] });
  stream.queryUsers.mockResolvedValue({ users: [] });
  stream.feeds.queryFollows.mockResolvedValue({ follows: [] });
  await Promise.all([
    PushToken.deleteMany({}),
    PushAnnouncement.deleteMany({}),
  ]);
});

describe("POST /api/pushTokens/sparkle", () => {
  it("notifies followers, reading them from the source feed's id", async () => {
    const author = newId();
    const follower = await withDevice();
    stream.feeds.getActivity.mockResolvedValue({ activity: activity(author) });
    stream.feeds.queryFollows.mockResolvedValue({ follows: [followFrom(follower)] });

    const res = await announce(author);

    expect(res.body.outcome).toBe("announced");
    await sent();
    expect(stream.feeds.queryFollows.mock.calls[0]?.[0].filter).toEqual({
      target_feed: `user:${author}`,
      status: "accepted",
    });
    const [tokens, push] = lastSend();
    expect(tokens).toEqual([deviceOf(follower)]);
    expect(push).toMatchObject({
      title: "Kai (@kai)",
      message: "Hello campus",
      data: { kind: "sparkle", type: "sparkle", id: "activity-1", handle: "kai" },
    });
  });

  it("pages through every follower, past the old 2,000 limit", async () => {
    const author = newId();
    const [first, second] = [await withDevice(), await withDevice()];
    stream.feeds.getActivity.mockResolvedValue({ activity: activity(author) });
    stream.feeds.queryFollows
      .mockResolvedValueOnce({ follows: [followFrom(first)], next: "page-2" })
      .mockResolvedValueOnce({ follows: [followFrom(second)] });

    await announce(author);

    await sent();
    expect(lastSend()[0].sort()).toEqual([deviceOf(first), deviceOf(second)].sort());
  });

  it("skips follows with push off, and people told separately", async () => {
    const author = newId();
    const [pushOff, mentioned, quoted, normal] = [
      await withDevice(),
      await withDevice(),
      await withDevice(),
      await withDevice(),
    ];
    stream.feeds.getActivity.mockResolvedValue({
      activity: activity(author, {
        mentioned_users: [{ id: mentioned }],
        parent: { user: { id: quoted } },
      }),
    });
    stream.feeds.queryFollows.mockResolvedValue({
      follows: [
        followFrom(pushOff, "none"),
        followFrom(mentioned),
        followFrom(quoted),
        followFrom(normal),
      ],
    });

    await announce(author);

    await sent();
    expect(lastSend()[0]).toEqual([deviceOf(normal)]);
  });

  it("refuses someone else's sparkle and doesn't announce it", async () => {
    stream.feeds.getActivity.mockResolvedValue({ activity: activity(newId()) });

    const res = await announce(newId());

    expect(res.status).toBe(403);
    expect(await PushAnnouncement.countDocuments()).toBe(0);
    expect(send).not.toHaveBeenCalled();
  });

  it("doesn't announce a private sparkle", async () => {
    const author = newId();
    stream.feeds.getActivity.mockResolvedValue({
      activity: activity(author, { visibility: "private" }),
    });

    const res = await announce(author);

    expect(res.body.outcome).toBe("not_public");
    expect(send).not.toHaveBeenCalled();
  });

  it("announces a sparkle only once", async () => {
    const author = newId();
    stream.feeds.getActivity.mockResolvedValue({ activity: activity(author) });

    await announce(author);
    await sent();
    const second = await announce(author);

    expect(second.body.outcome).toBe("already_announced");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("sends an anonymous sparkle to everyone but the author, showing only the alias", async () => {
    const author = await withDevice();
    const stranger = await withDevice();
    stream.feeds.getActivity.mockResolvedValue({
      activity: activity(author, { custom: { anonymous: true, anonymous_alias: "Quiet Comet" } }),
    });

    await announce(author);

    await sent();
    expect(stream.feeds.queryFollows).not.toHaveBeenCalled();
    const [tokens, push] = lastSend();
    expect(tokens).toEqual([deviceOf(stranger)]);
    expect(push["title"]).toBe("Quiet Comet");
    expect(JSON.stringify(push)).not.toContain("kai");
    expect(JSON.stringify(push)).not.toContain("Kai");
  });

  it("limits how many anonymous sparkles reach everyone in an hour", async () => {
    const author = newId();
    await PushAnnouncement.create(
      Array.from({ length: MAX_ANONYMOUS_PER_HOUR }, (_, index) => ({
        activityId: `earlier-${index}`,
        authorId: author,
        anonymous: true,
      })),
    );
    stream.feeds.getActivity.mockResolvedValue({
      activity: activity(author, { custom: { anonymous: true } }),
    });

    const res = await announce(author);

    expect(res.body.outcome).toBe("rate_limited");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("POST /api/pushTokens/send-to-many", () => {
  it("drops anyone muting the sender, or blocked either way", async () => {
    const sender = newId();
    const [muter, blockedBySender, blockerOfSender, normal] = [
      await withDevice(),
      await withDevice(),
      await withDevice(),
      await withDevice(),
    ];
    stream.getBlockedUsers.mockResolvedValue({ blocks: [{ blocked_user_id: blockedBySender }] });
    stream.queryUsers.mockResolvedValue({
      users: [
        { id: muter, blocked_user_ids: [], mutes: [{ target: { id: sender } }] },
        { id: blockerOfSender, blocked_user_ids: [sender] },
        { id: normal, blocked_user_ids: [] },
      ],
    });

    await sendToMany(sender, [muter, blockedBySender, blockerOfSender, normal]);

    expect(lastSend()[0]).toEqual([deviceOf(normal)]);
  });

  it("sends nothing when blocks can't be checked", async () => {
    const recipient = await withDevice();
    stream.queryUsers.mockRejectedValue(new Error("Stream is down"));

    const res = await sendToMany(newId(), [recipient]);

    expect(res.status).toBe(200);
    expect(lastSend()[0]).toEqual([]);
  });

  it("ignores invalid ids and the sender, rather than losing the batch", async () => {
    const sender = await withDevice();
    const recipient = await withDevice();

    const res = await sendToMany(sender, ["anonymous", { $ne: null }, sender, recipient]);

    expect(res.status).toBe(200);
    expect(lastSend()[0]).toEqual([deviceOf(recipient)]);
  });

  it("refuses more than 100 recipients", async () => {
    const res = await sendToMany(newId(), Array.from({ length: 101 }, newId));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/pushTokens/send-to-all", () => {
  it("is refused for a normal account", async () => {
    const id = await withDevice();
    const res = await request(app)
      .post("/api/pushTokens/send-to-all")
      .set("x-auth-token", tokenFor(id))
      .send({ message: "Everyone!" });

    expect(res.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("device registration", () => {
  const register = (userId: string, pushToken: string) =>
    request(app)
      .post("/api/pushTokens")
      .set("x-auth-token", tokenFor(userId))
      .send({ pushToken });

  it("keeps every phone of one account", async () => {
    const id = newId();
    await register(id, "ExponentPushToken[phone-1]");
    await register(id, "ExponentPushToken[phone-2]");
    expect(await PushToken.countDocuments({ userId: id })).toBe(2);
  });

  it("moves a phone to whoever signs in on it last", async () => {
    const [first, second] = [newId(), newId()];
    await register(first, "ExponentPushToken[shared]");
    await register(second, "ExponentPushToken[shared]");

    expect(await PushToken.countDocuments({ userId: first })).toBe(0);
    expect(await PushToken.countDocuments({ userId: second })).toBe(1);
  });

  it("rejects a token that isn't a string", async () => {
    const res = await request(app)
      .post("/api/pushTokens")
      .set("x-auth-token", tokenFor(newId()))
      .send({ pushToken: { $ne: null } });
    expect(res.status).toBe(400);
  });

  it("DELETE releases the caller's own device only", async () => {
    const [owner, other] = [await withDevice(), newId()];

    await request(app)
      .delete("/api/pushTokens")
      .set("x-auth-token", tokenFor(other))
      .send({ pushToken: deviceOf(owner) });
    expect(await PushToken.countDocuments({ userId: owner })).toBe(1);

    const res = await request(app)
      .delete("/api/pushTokens")
      .set("x-auth-token", tokenFor(owner))
      .send({ pushToken: deviceOf(owner) });
    expect(res.status).toBe(200);
    expect(await PushToken.countDocuments({ userId: owner })).toBe(0);
  });
});
