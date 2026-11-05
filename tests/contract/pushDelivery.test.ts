import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import mongoose from "mongoose";

import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { PushToken } from "../../src/models/pushToken.js";
import { checkPushReceipts, sendPushNotificationTo } from "../../src/utils/pushNotifications.js";

const expo = vi.hoisted(() => ({
  sendPushNotificationsAsync: vi.fn(),
  chunkPushNotifications: vi.fn((messages: unknown[]) => [messages]),
  chunkPushNotificationReceiptIds: vi.fn((ids: string[]) => [ids]),
  getPushNotificationReceiptsAsync: vi.fn(),
}));

vi.mock("expo-server-sdk", () => ({
  Expo: Object.assign(
    function Expo() {
      return expo;
    },
    { isExpoPushToken: (token: string) => token.startsWith("ExponentPushToken[") },
  ),
}));

const token = (name: string) => `ExponentPushToken[${name}]`;
const sentTo = (call: number) =>
  (expo.sendPushNotificationsAsync.mock.calls[call]?.[0] as { to: string[] }[])[0]?.to;

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  await PushToken.syncIndexes();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(async () => {
  vi.clearAllMocks();
  await PushToken.deleteMany({});
});

describe("sendPushNotificationTo", () => {
  it("drops malformed tokens and repeats, and sends at high priority", async () => {
    expo.sendPushNotificationsAsync.mockResolvedValue([{ status: "ok", id: "r1" }]);

    await sendPushNotificationTo([token("a"), token("a"), "not-a-token"], { message: "Hi" });

    const [message] = expo.sendPushNotificationsAsync.mock.calls[0]?.[0] as Record<string, unknown>[];
    expect(message).toMatchObject({
      to: [token("a")],
      body: "Hi",
      priority: "high",
      channelId: "default",
    });
  });

  it("sends nothing when no token is valid", async () => {
    await sendPushNotificationTo(["not-a-token"], { message: "Hi" });
    expect(expo.sendPushNotificationsAsync).not.toHaveBeenCalled();
  });

  it("re-sends per Expo project when a batch mixes projects", async () => {
    const mixed = Object.assign(new Error("mixed"), {
      code: "PUSH_TOO_MANY_EXPERIENCE_IDS",
      details: { "@old/app": [token("old")], "@new/app": [token("new")] },
    });
    expo.sendPushNotificationsAsync
      .mockRejectedValueOnce(mixed)
      .mockResolvedValue([{ status: "ok", id: "r" }]);

    await sendPushNotificationTo([token("old"), token("new")], { message: "Hi" });

    expect(expo.sendPushNotificationsAsync).toHaveBeenCalledTimes(3);
    expect([sentTo(1), sentTo(2)]).toEqual([[token("old")], [token("new")]]);
  });

  it("forgets a device Expo says is gone", async () => {
    const userId = new mongoose.Types.ObjectId();
    await PushToken.create([
      { userId, pushToken: token("gone") },
      { userId, pushToken: token("kept") },
    ]);
    expo.sendPushNotificationsAsync.mockResolvedValue([
      { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      { status: "ok", id: "r" },
    ]);

    await sendPushNotificationTo([token("gone"), token("kept")], { message: "Hi" });

    const left = await PushToken.find({ userId }).lean();
    expect(left.map((row) => row.pushToken)).toEqual([token("kept")]);
  });

  it("never throws", async () => {
    expo.sendPushNotificationsAsync.mockRejectedValue(new Error("Expo is down"));
    await expect(
      sendPushNotificationTo([token("a")], { message: "Hi" }),
    ).resolves.toBeUndefined();
  });
});

describe("checkPushReceipts", () => {
  it("forgets a device whose receipt says it is gone, and keeps the rest", async () => {
    const userId = new mongoose.Types.ObjectId();
    await PushToken.create([
      { userId, pushToken: token("gone") },
      { userId, pushToken: token("kept") },
    ]);
    expo.getPushNotificationReceiptsAsync.mockResolvedValue({
      r1: { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
      r2: { status: "ok" },
      r3: { status: "error", message: "bad key", details: { error: "InvalidCredentials" } },
    });

    await checkPushReceipts(
      expo as never,
      new Map([
        ["r1", token("gone")],
        ["r2", token("kept")],
        ["r3", token("kept")],
      ]),
    );

    const left = await PushToken.find({ userId }).lean();
    expect(left.map((row) => row.pushToken)).toEqual([token("kept")]);
  });
});
