import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { PushAnnouncement } from "../../src/models/pushAnnouncement.js";
import { PushPreference } from "../../src/models/pushPreference.js";
import { PushToken } from "../../src/models/pushToken.js";

/**
 * Likes, resparkles and follows, pushed through Expo because Stream's pushes for
 * them never reached Android. Stream is still asked whether each really happened.
 */

const stream = vi.hoisted(() => ({
  getBlockedUsers: vi.fn(),
  queryUsers: vi.fn(),
  feeds: {
    getActivity: vi.fn(),
    getComment: vi.fn(),
    queryActivityReactions: vi.fn(),
    queryCommentReactions: vi.fn(),
    queryFollows: vi.fn(),
  },
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

/** Every push sent, as [tokens, payload]. */
const sends = () => send.mock.calls as unknown as [string[], Record<string, unknown>][];
const sentTo = (id: string) => sends().find(([tokens]) => tokens.includes(deviceOf(id)))?.[1];

const announce = (actorId: string, action: string, targetId: string) =>
  request(app)
    .post("/api/pushTokens/engagement")
    .set("x-auth-token", tokenFor(actorId))
    .send({ action, targetId });

/** The actor's Stream record for the push title; any other query is a block check. */
function streamUsers(actorId: string) {
  stream.queryUsers.mockImplementation(
    async ({ payload }: { payload: { filter_conditions: { id: unknown } } }) => ({
      users:
        payload.filter_conditions.id === actorId
          ? [{ id: actorId, name: "Kai", custom: { username: "kai" } }]
          : [],
    }),
  );
}

const reacted = (userId: string, type: string) => ({
  reactions: [{ type, user: { id: userId } }],
});

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
  stream.feeds.queryActivityReactions.mockResolvedValue({ reactions: [] });
  stream.feeds.queryCommentReactions.mockResolvedValue({ reactions: [] });
  stream.feeds.queryFollows.mockResolvedValue({ follows: [] });
  await Promise.all([
    PushToken.deleteMany({}),
    PushPreference.deleteMany({}),
    PushAnnouncement.deleteMany({}),
  ]);
});

describe("POST /api/pushTokens/engagement", () => {
  it("tells the owner who liked their sparkle", async () => {
    const [actor, owner] = [newId(), await withDevice()];
    streamUsers(actor);
    stream.feeds.getActivity.mockResolvedValue({
      activity: { id: "a1", text: "Exam week", user: { id: owner } },
    });
    stream.feeds.queryActivityReactions.mockResolvedValue(reacted(actor, "like"));

    const res = await announce(actor, "like", "a1");

    expect(res.body.outcome).toBe("announced");
    await vi.waitFor(() => expect(sentTo(owner)).toBeDefined(), { timeout: 20_000 });
    expect(sentTo(owner)).toMatchObject({
      title: "Kai liked your sparkle",
      message: "Exam week",
      data: { kind: "like", id: "a1" },
    });
  });

  it("tells a reply's author about a like on it", async () => {
    const [actor, owner] = [newId(), await withDevice()];
    streamUsers(actor);
    stream.feeds.getComment.mockResolvedValue({
      comment: { id: "r1", text: "Same", user: { id: owner } },
    });
    stream.feeds.queryCommentReactions.mockResolvedValue(reacted(actor, "like"));

    await announce(actor, "reply_like", "r1");

    await vi.waitFor(() => expect(sentTo(owner)).toBeDefined(), { timeout: 20_000 });
    expect(sentTo(owner)).toMatchObject({ title: "Kai liked your reply" });
  });

  it("tells the owner and the resparkler's followers about a resparkle", async () => {
    const [actor, owner, follower] = [newId(), await withDevice(), await withDevice()];
    streamUsers(actor);
    stream.feeds.getActivity.mockResolvedValue({
      activity: { id: "a1", text: "Exam week", user: { id: owner } },
    });
    stream.feeds.queryActivityReactions.mockResolvedValue(reacted(actor, "resparkle"));
    stream.feeds.queryFollows.mockResolvedValue({
      follows: [{ push_preference: "", source_feed: { id: follower } }],
    });

    await announce(actor, "resparkle", "a1");

    await vi.waitFor(() => expect(sentTo(follower)).toBeDefined(), { timeout: 20_000 });
    await vi.waitFor(() => expect(sentTo(owner)).toBeDefined(), { timeout: 20_000 });
    expect(sentTo(owner)).toMatchObject({ title: "Kai resparkled your sparkle" });
    expect(sentTo(follower)).toMatchObject({
      title: "Kai resparkled",
      message: "Exam week",
      data: { kind: "resparkle", id: "a1" },
    });
  });

  it("tells someone who followed them, opening the follower's profile", async () => {
    const [actor, followed] = [newId(), await withDevice()];
    streamUsers(actor);
    stream.feeds.queryFollows.mockResolvedValue({ follows: [{}] });

    await announce(actor, "follow", followed);

    await vi.waitFor(() => expect(sentTo(followed)).toBeDefined(), { timeout: 20_000 });
    expect(stream.feeds.queryFollows.mock.calls[0]?.[0].filter).toEqual({
      source_feed: `timeline:${actor}`,
      target_feed: `user:${followed}`,
    });
    expect(sentTo(followed)).toMatchObject({
      title: "Kai followed you",
      data: { kind: "follow", id: actor, handle: "kai" },
    });
  });

  it("refuses a like Stream doesn't show", async () => {
    const actor = newId();
    stream.feeds.getActivity.mockResolvedValue({ activity: { id: "a1", user: { id: newId() } } });

    const res = await announce(actor, "like", "a1");

    expect(res.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it("buzzes once however often someone unlikes and likes again", async () => {
    const [actor, owner] = [newId(), await withDevice()];
    streamUsers(actor);
    stream.feeds.getActivity.mockResolvedValue({ activity: { id: "a1", user: { id: owner } } });
    stream.feeds.queryActivityReactions.mockResolvedValue(reacted(actor, "like"));

    await announce(actor, "like", "a1");
    const again = await announce(actor, "like", "a1");

    expect(again.body.outcome).toBe("already_announced");
  });

  it("skips an owner who turned like pushes off", async () => {
    const [actor, owner] = [newId(), await withDevice()];
    await PushPreference.create({ userId: owner, off: ["likes"] });
    streamUsers(actor);
    stream.feeds.getActivity.mockResolvedValue({ activity: { id: "a1", user: { id: owner } } });
    stream.feeds.queryActivityReactions.mockResolvedValue(reacted(actor, "like"));

    await announce(actor, "like", "a1");

    await vi.waitFor(() => expect(send).toHaveBeenCalled(), { timeout: 20_000 });
    expect(sentTo(owner)).toBeUndefined();
  });

  it("refuses an action it doesn't announce", async () => {
    const res = await announce(newId(), "bookmark", "a1");
    expect(res.status).toBe(400);
  });
});
