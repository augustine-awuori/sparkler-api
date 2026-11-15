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
 * Replies and DMs pushed through Expo, because Stream's own pushes for them
 * never reached Android (reports SPK-1003 and SPK-1004).
 */

const stream = vi.hoisted(() => ({
  getBlockedUsers: vi.fn(),
  queryUsers: vi.fn(),
  feeds: { getActivity: vi.fn(), getComment: vi.fn() },
  chat: { getMessage: vi.fn(), queryMembers: vi.fn() },
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

const person = (id: string) => ({ id, name: "Kai", custom: { username: "kai" } });

/** Sending carries on after the response, and can take a moment against a real Mongo. */
const sent = () => vi.waitFor(() => expect(send).toHaveBeenCalled(), { timeout: 20_000 });
const lastSend = () => send.mock.lastCall as unknown as [string[], Record<string, unknown>];

const post = (path: string, senderId: string, body: object) =>
  request(app).post(`/api/pushTokens/${path}`).set("x-auth-token", tokenFor(senderId)).send(body);

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
  await Promise.all([
    PushToken.deleteMany({}),
    PushPreference.deleteMany({}),
    PushAnnouncement.deleteMany({}),
  ]);
});

describe("POST /api/pushTokens/reply", () => {
  function reply(senderId: string, overrides: Record<string, unknown> = {}) {
    return {
      id: "reply-1",
      object_id: "activity-1",
      text: "Same\nhere",
      custom: {},
      user: person(senderId),
      ...overrides,
    };
  }

  it("tells the sparkle's author and the reply's author, in the replier's words", async () => {
    const [sender, sparkleAuthor, replyAuthor] = [
      newId(),
      await withDevice(),
      await withDevice(),
    ];
    stream.feeds.getComment.mockImplementation(async ({ id }: { id: string }) => ({
      comment:
        id === "reply-1"
          ? reply(sender, { parent_id: "reply-0" })
          : { id, user: { id: replyAuthor } },
    }));
    stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: sparkleAuthor } } });

    const res = await post("reply", sender, { commentId: "reply-1" });

    expect(res.body.outcome).toBe("announced");
    await sent();
    const [tokens, push] = lastSend();
    expect(tokens.sort()).toEqual([deviceOf(sparkleAuthor), deviceOf(replyAuthor)].sort());
    expect(push).toMatchObject({
      title: "Kai replied",
      message: "Same here",
      data: { kind: "comment", type: "comment", id: "reply-1" },
    });
  });

  it("tells people the reply mentions, except whoever it answers", async () => {
    const [sender, author, mentioned] = [newId(), await withDevice(), await withDevice()];
    stream.feeds.getComment.mockResolvedValue({
      comment: reply(sender, { mentioned_users: [{ id: mentioned }, { id: author }] }),
    });
    stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: author } } });

    await post("reply", sender, { commentId: "reply-1" });

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2), { timeout: 20_000 });
    const pushes = send.mock.calls as unknown as [string[], Record<string, unknown>][];
    const mention = pushes.find(([, push]) => push.title === "Kai mentioned you");
    expect(mention?.[0]).toEqual([deviceOf(mentioned)]);
    expect(mention?.[1]).toMatchObject({ data: { kind: "mention", id: "reply-1" } });
  });

  it("never pushes the replier about their own sparkle", async () => {
    const sender = await withDevice();
    stream.feeds.getComment.mockResolvedValue({ comment: reply(sender) });
    stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: sender } } });

    await post("reply", sender, { commentId: "reply-1" });

    await sent();
    expect(lastSend()[0]).toEqual([]);
  });

  it("skips someone who turned reply pushes off", async () => {
    const [sender, author] = [newId(), await withDevice()];
    await PushPreference.create({ userId: author, off: ["replies"] });
    stream.feeds.getComment.mockResolvedValue({ comment: reply(sender) });
    stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: author } } });

    await post("reply", sender, { commentId: "reply-1" });

    await sent();
    expect(lastSend()[0]).toEqual([]);
  });

  it("refuses someone else's reply", async () => {
    stream.feeds.getComment.mockResolvedValue({ comment: reply(newId()) });

    const res = await post("reply", newId(), { commentId: "reply-1" });

    expect(res.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it("leaves anonymous replies to their own path, which names only the alias", async () => {
    const sender = newId();
    stream.feeds.getComment.mockResolvedValue({
      comment: reply(sender, { custom: { anonymous: true, anonymous_alias: "Quiet Comet" } }),
    });

    const res = await post("reply", sender, { commentId: "reply-1" });

    expect(res.body.outcome).toBe("anonymous");
    expect(send).not.toHaveBeenCalled();
  });

  it("announces a reply only once", async () => {
    const [sender, author] = [newId(), await withDevice()];
    stream.feeds.getComment.mockResolvedValue({ comment: reply(sender) });
    stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: author } } });

    await post("reply", sender, { commentId: "reply-1" });
    const again = await post("reply", sender, { commentId: "reply-1" });

    expect(again.body.outcome).toBe("already_announced");
  });

  it("needs a reply id", async () => {
    const res = await post("reply", newId(), {});
    expect(res.status).toBe(400);
  });
});

describe("POST /api/pushTokens/message", () => {
  function message(senderId: string, overrides: Record<string, unknown> = {}) {
    return {
      id: "message-1",
      type: "regular",
      text: "See you at the library",
      user: person(senderId),
      channel: { type: "messaging", id: "dm-1" },
      ...overrides,
    };
  }

  const member = (id: string, overrides: Record<string, unknown> = {}) => ({
    user_id: id,
    notifications_muted: false,
    banned: false,
    ...overrides,
  });

  it("tells everyone else in the chat, opening the thread with the sender", async () => {
    const [sender, other] = [await withDevice(), await withDevice()];
    stream.chat.getMessage.mockResolvedValue({ message: message(sender) });
    stream.chat.queryMembers.mockResolvedValue({ members: [member(sender), member(other)] });

    const res = await post("message", sender, { messageId: "message-1" });

    expect(res.body.outcome).toBe("announced");
    await sent();
    expect(stream.chat.queryMembers.mock.calls[0]?.[0].payload).toMatchObject({
      type: "messaging",
      id: "dm-1",
    });
    const [tokens, push] = lastSend();
    expect(tokens).toEqual([deviceOf(other)]);
    expect(push).toMatchObject({
      title: "Kai",
      message: "See you at the library",
      data: { kind: "message", type: "message", userId: sender },
    });
  });

  it("says something for a message that is only a photo", async () => {
    const [sender, other] = [newId(), await withDevice()];
    stream.chat.getMessage.mockResolvedValue({ message: message(sender, { text: "" }) });
    stream.chat.queryMembers.mockResolvedValue({ members: [member(other)] });

    await post("message", sender, { messageId: "message-1" });

    await sent();
    expect(lastSend()[1]).toMatchObject({ message: "Sent you an attachment" });
  });

  it("skips members who muted the chat, or turned message pushes off", async () => {
    const [sender, mutedChat, settingOff] = [newId(), await withDevice(), await withDevice()];
    await PushPreference.create({ userId: settingOff, off: ["messages"] });
    stream.chat.getMessage.mockResolvedValue({ message: message(sender) });
    stream.chat.queryMembers.mockResolvedValue({
      members: [member(mutedChat, { notifications_muted: true }), member(settingOff)],
    });

    await post("message", sender, { messageId: "message-1" });

    await sent();
    expect(lastSend()[0]).toEqual([]);
  });

  it("refuses someone else's message", async () => {
    stream.chat.getMessage.mockResolvedValue({ message: message(newId()) });

    const res = await post("message", newId(), { messageId: "message-1" });

    expect(res.status).toBe(403);
    expect(send).not.toHaveBeenCalled();
  });

  it("doesn't announce Stream's system messages", async () => {
    const sender = newId();
    stream.chat.getMessage.mockResolvedValue({ message: message(sender, { type: "system" }) });

    const res = await post("message", sender, { messageId: "message-1" });

    expect(res.body.outcome).toBe("not_a_message");
    expect(send).not.toHaveBeenCalled();
  });

  it("answers even when Stream can't list the members", async () => {
    const sender = newId();
    stream.chat.getMessage.mockResolvedValue({ message: message(sender) });
    stream.chat.queryMembers.mockRejectedValue(new Error("Stream is down"));

    const res = await post("message", sender, { messageId: "message-2" });

    expect(res.status).toBe(200);
    expect(res.body.outcome).toBe("announced");
  });
});
