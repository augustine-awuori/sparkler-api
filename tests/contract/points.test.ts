import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { POINT_RULES } from "../../src/domain/points.js";
import { PointEvent } from "../../src/models/pointEvent.js";
import { Sparkler } from "../../src/models/sparkler.js";

const stream = vi.hoisted(() => ({
  feeds: {
    getActivity: vi.fn(),
    getComment: vi.fn(),
    queryActivityReactions: vi.fn(),
    queryCommentReactions: vi.fn(),
    queryBookmarks: vi.fn(),
    queryFollows: vi.fn(),
  },
  queryPollVotes: vi.fn(),
  upsertUsers: vi.fn(),
  deleteUsers: vi.fn(),
}));

vi.mock("../../src/services/stream.js", async (original) => ({
  ...(await original<object>()),
  streamClient: () => stream,
}));

let app: Application;
let count = 0;

async function aUser() {
  count += 1;
  const user = await new Sparkler({
    email: `points-${count}-${Date.now()}@example.com`,
    name: `Person ${count}`,
    custom: { username: `points${count}${Date.now()}` },
  }).save();
  const id = user._id.toString();
  const token = jwt.sign({ id, custom: {} }, process.env.jwtPrivateKey as string);
  const claim = (action: string, targetId: string) =>
    request(app).post("/api/points/claims").set("x-auth-token", token).send({ action, targetId });
  return { id, token, claim };
}

/** Someone else's sparkle, which the caller has liked. */
function aLikedSparkle(userId: string) {
  stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: "someone-else" } } });
  stream.feeds.queryActivityReactions.mockResolvedValue({
    reactions: [{ user: { id: userId }, type: "like" }],
  });
}

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(() => vi.resetAllMocks());

describe("claiming points", () => {
  it("awards a verified like and returns the new total", async () => {
    const user = await aUser();
    aLikedSparkle(user.id);

    const res = await user.claim("like", "activity-1");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      outcome: "awarded",
      awarded: POINT_RULES.like.points,
      total: POINT_RULES.like.points,
    });
    expect((await Sparkler.findById(user.id))?.points).toBe(POINT_RULES.like.points);
  });

  it("adds up across different things", async () => {
    const user = await aUser();
    aLikedSparkle(user.id);
    await user.claim("like", "activity-1");

    stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: user.id } } });
    const res = await user.claim("sparkle", "activity-2");

    expect(res.body.total).toBe(POINT_RULES.like.points + POINT_RULES.sparkle.points);
  });

  // Like, unlike, like again: the second like is the same claim.
  it("awards the same thing only once, without asking Stream again", async () => {
    const user = await aUser();
    aLikedSparkle(user.id);
    await user.claim("like", "activity-1");
    stream.feeds.getActivity.mockClear();

    const res = await user.claim("like", "activity-1");

    expect(res.body).toMatchObject({ outcome: "already_claimed", awarded: 0, total: 1 });
    expect(stream.feeds.getActivity).not.toHaveBeenCalled();
  });

  it("lets only one of several simultaneous claims earn", async () => {
    const user = await aUser();
    aLikedSparkle(user.id);
    await PointEvent.init();

    const results = await Promise.all([1, 2, 3, 4].map(() => user.claim("like", "same-activity")));

    expect(results.map((res) => res.body.awarded).filter(Boolean)).toHaveLength(1);
    expect((await Sparkler.findById(user.id))?.points).toBe(POINT_RULES.like.points);
  });

  it("stops at the daily cap, and earns again once the day has passed", async () => {
    const user = await aUser();
    aLikedSparkle(user.id);
    const { dailyCap, points } = POINT_RULES.bookmark;
    await PointEvent.insertMany(
      Array.from({ length: dailyCap }, (_, index) => ({
        userId: user.id,
        action: "bookmark",
        targetId: `old-${index}`,
        points,
      })),
    );
    stream.feeds.queryBookmarks.mockResolvedValue({ bookmarks: [{ user: { id: user.id } }] });

    expect((await user.claim("bookmark", "one-more")).body.outcome).toBe("daily_cap");

    const yesterday = new Date(Date.now() - 25 * 60 * 60 * 1000);
    await PointEvent.updateMany({ userId: user.id }, { $set: { createdAt: yesterday } });
    expect((await user.claim("bookmark", "one-more")).body.outcome).toBe("awarded");
  });

  it("awards nothing when Stream can't be reached, and allows a retry", async () => {
    const user = await aUser();
    stream.feeds.getActivity.mockRejectedValue(new Error("Stream is down"));

    const failed = await user.claim("like", "activity-1");
    expect(failed.status).toBe(200);
    expect(failed.body).toMatchObject({ outcome: "not_verified", awarded: 0 });

    stream.feeds.getActivity.mockReset();
    aLikedSparkle(user.id);
    expect((await user.claim("like", "activity-1")).body.outcome).toBe("awarded");
  });

  it.each([
    ["an unknown action", { action: "breathe", targetId: "x" }],
    ["no target", { action: "like" }],
    ["a query operator for a target", { action: "like", targetId: { $ne: null } }],
  ])("refuses %s", async (_label, body) => {
    const user = await aUser();
    const res = await request(app)
      .post("/api/points/claims")
      .set("x-auth-token", user.token)
      .send(body);
    expect(res.status).toBe(400);
  });

  it("needs a signed-in caller", async () => {
    const res = await request(app)
      .post("/api/points/claims")
      .send({ action: "like", targetId: "x" });
    expect(res.status).toBe(401);
  });
});

describe("what counts as having done it", () => {
  it("needs the reaction to really be the caller's", async () => {
    const user = await aUser();
    stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: "someone-else" } } });
    stream.feeds.queryActivityReactions.mockResolvedValue({
      reactions: [{ user: { id: "another-person" }, type: "like" }],
    });
    expect((await user.claim("like", "activity-1")).body.outcome).toBe("not_verified");
  });

  it("gives nothing for liking your own sparkle", async () => {
    const user = await aUser();
    stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: user.id } } });
    stream.feeds.queryActivityReactions.mockResolvedValue({
      reactions: [{ user: { id: user.id }, type: "like" }],
    });
    expect((await user.claim("like", "activity-1")).body.outcome).toBe("not_verified");
  });

  it("gives nothing for a sparkle someone else wrote", async () => {
    const user = await aUser();
    stream.feeds.getActivity.mockResolvedValue({ activity: { user: { id: "someone-else" } } });
    expect((await user.claim("sparkle", "activity-1")).body.outcome).toBe("not_verified");
  });

  // A public total rising right after an anonymous post could point at its author.
  it.each([
    ["sparkle", "getActivity", { activity: { custom: { anonymous: true } } }],
    ["reply", "getComment", { comment: { custom: { anonymous: true } } }],
  ] as const)("gives nothing for an anonymous %s", async (action, read, answer) => {
    const user = await aUser();
    const post = Object.values(answer)[0] as Record<string, unknown>;
    post.user = { id: user.id };
    stream.feeds[read].mockResolvedValue(answer);
    expect((await user.claim(action, "post-1")).body.outcome).toBe("not_verified");
  });

  it("tells a quote from a sparkle", async () => {
    const user = await aUser();
    stream.feeds.getActivity.mockResolvedValue({
      activity: { user: { id: user.id }, parent: { id: "original" } },
    });
    expect((await user.claim("sparkle", "activity-1")).body.outcome).toBe("not_verified");
    expect((await user.claim("quote", "activity-1")).body.outcome).toBe("awarded");
  });

  it("verifies a reply, a follow and a poll vote", async () => {
    const user = await aUser();
    stream.feeds.getComment.mockResolvedValue({ comment: { user: { id: user.id } } });
    stream.feeds.queryFollows.mockResolvedValue({ follows: [{}] });
    stream.queryPollVotes.mockResolvedValue({ votes: [{ user_id: user.id }] });

    expect((await user.claim("reply", "comment-1")).body.outcome).toBe("awarded");
    expect((await user.claim("follow", "their-id")).body.outcome).toBe("awarded");
    expect((await user.claim("poll_vote", "poll-1")).body.outcome).toBe("awarded");
    expect(stream.feeds.queryFollows).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: { source_feed: `timeline:${user.id}`, target_feed: "user:their-id" },
      }),
    );
  });

  it("gives nothing for following yourself, or a follow Stream doesn't have", async () => {
    const user = await aUser();
    expect((await user.claim("follow", user.id)).body.outcome).toBe("not_verified");
    stream.feeds.queryFollows.mockResolvedValue({ follows: [] });
    expect((await user.claim("follow", "their-id")).body.outcome).toBe("not_verified");
  });

  it("verifies liking and resparkling someone else's reply", async () => {
    const user = await aUser();
    stream.feeds.getComment.mockResolvedValue({ comment: { user: { id: "someone-else" } } });
    stream.feeds.queryCommentReactions.mockImplementation(async ({ filter }) => ({
      reactions: [{ user: { id: user.id }, type: filter.reaction_type }],
    }));

    expect((await user.claim("reply_like", "comment-1")).body.outcome).toBe("awarded");
    expect((await user.claim("reply_resparkle", "comment-1")).body.outcome).toBe("awarded");
  });
});

describe("points on a profile", () => {
  it("shows in the public directory, starting at nothing", async () => {
    const user = await aUser();
    const fresh = await request(app).get(`/api/sparklers/${user.id}`);
    expect(fresh.body.points).toBe(0);

    aLikedSparkle(user.id);
    await user.claim("like", "activity-1");

    const after = await request(app).get(`/api/sparklers/${user.id}`);
    expect(after.body.points).toBe(POINT_RULES.like.points);
  });

  it("can't be set by editing your profile", async () => {
    const user = await aUser();
    await request(app)
      .patch("/api/sparklers")
      .set("x-auth-token", user.token)
      .send({ points: 9999, name: "Same", custom: { points: 9999 } });

    const stored = await Sparkler.findById(user.id).lean();
    expect(stored?.points ?? 0).toBe(0);
    expect((stored?.custom as Record<string, unknown>).points).toBeUndefined();
  });

  it("never reaches the public directory's custom fields as something writable", async () => {
    const user = await aUser();
    const res = await request(app).get(`/api/sparklers/${user.id}`);
    expect(res.body.custom.points).toBeUndefined();
  });

  it("is forgotten with the account", async () => {
    const user = await aUser();
    aLikedSparkle(user.id);
    await user.claim("like", "activity-1");
    stream.deleteUsers.mockResolvedValue({});

    await request(app).delete("/api/sparklers").set("x-auth-token", user.token);

    expect(await PointEvent.countDocuments({ userId: user.id })).toBe(0);
  });
});

describe("GET /api/points/me", () => {
  it("answers with the caller's own total", async () => {
    const user = await aUser();
    aLikedSparkle(user.id);
    await user.claim("like", "activity-1");

    const res = await request(app).get("/api/points/me").set("x-auth-token", user.token);

    expect(res.body).toEqual({ total: POINT_RULES.like.points });
  });
});

describe("GET /api/points/rules", () => {
  it("lists every action from the one central table", async () => {
    const res = await request(app).get("/api/points/rules");
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(Object.keys(POINT_RULES).length);
    expect(res.body).toContainEqual({
      action: "sparkle",
      points: POINT_RULES.sparkle.points,
      dailyCap: POINT_RULES.sparkle.dailyCap,
      label: POINT_RULES.sparkle.label,
    });
  });
});
