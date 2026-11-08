import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { Developer } from "../../src/models/developer.js";
import { ErrorEvent } from "../../src/models/errorEvent.js";
import { ErrorGroup } from "../../src/models/errorGroup.js";
import { Sparkler } from "../../src/models/sparkler.js";

const mail = vi.hoisted(() => ({ sendMailBatch: vi.fn(async () => ({ sent: 1, failed: 0 })) }));
vi.mock("../../src/services/mail.js", async (original) => ({
  ...(await original<object>()),
  sendMailBatch: mail.sendMailBatch,
}));

let app: Application;
let count = 0;
let ip = 0;

/** Each test reports from its own address, so the ingest rate limit only bites where it's meant to. */
function freshIp(): string {
  ip += 1;
  return `10.0.${Math.floor(ip / 250)}.${ip % 250}`;
}

async function aUser(custom: Record<string, unknown> = {}) {
  count += 1;
  const user = await new Sparkler({
    email: `errors-${count}-${Date.now()}@example.com`,
    name: `Dev ${count}`,
    custom: { username: `dev${count}${Date.now()}`, ...custom },
  }).save();
  const id = user._id.toString();
  const token = jwt.sign({ id, custom: {} }, process.env.jwtPrivateKey as string);
  const as = (method: "get" | "post" | "patch", path: string) =>
    request(app)[method](path).set("x-auth-token", token);
  return { id, email: user.email, name: user.name as string, token, as };
}

type Person = Awaited<ReturnType<typeof aUser>>;

async function anAdmin() {
  const admin = await aUser({ isAdmin: true });
  const me = await admin.as("get", "/api/errors/developers/me");
  return { ...admin, developerId: me.body.id as string };
}

/** Registers someone and has an admin approve them. */
async function aDeveloper(admin: Person) {
  const person = await aUser();
  const registered = await person.as("post", "/api/errors/developers/register");
  await admin.as("patch", `/api/errors/developers/${registered.body.id}`).send({ status: "active" });
  return { ...person, developerId: registered.body.id as string };
}

let uniqueMessage = 0;
function anEvent(overrides: Record<string, unknown> = {}) {
  uniqueMessage += 1;
  return {
    app: "mobile",
    errorClass: "TypeError",
    message: `Cannot read property of undefined #case${uniqueMessage}`,
    stack: `TypeError: boom\n    at renderFeed${uniqueMessage} (address at index.android.bundle:1:${uniqueMessage})`,
    appVersion: "3.0.8",
    platform: "android",
    os: "Android",
    osVersion: "14",
    device: "Pixel 8",
    screen: "Home",
    handled: false,
    breadcrumbs: [{ at: new Date().toISOString(), type: "navigation", message: "Home" }],
    ...overrides,
  };
}

function report(body: unknown, token?: string) {
  const call = request(app).post("/api/errors/events").set("x-forwarded-for", freshIp());
  return (token ? call.set("x-auth-token", token) : call).send(body as object);
}

async function groupOf(event: { message: string }) {
  return await ErrorGroup.findOne({ message: event.message }).orFail();
}

function mailsSent(): { to: string; subject: string; message: string }[] {
  return mail.sendMailBatch.mock.calls.flatMap((call) => (call as unknown as [never[]])[0]);
}

/** Mail goes out in the background, after the response. */
async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 20));
}

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(() => vi.clearAllMocks());

describe("reporting an error", () => {
  it("needs no sign-in, and stores the event under a new group", async () => {
    const event = anEvent();
    const res = await report(event);

    expect(res.status).toBe(202);
    const group = await groupOf(event);
    expect(group).toMatchObject({ app: "mobile", status: "open", eventCount: 1, lastVersion: "3.0.8" });
    const stored = await ErrorEvent.findOne({ groupId: group._id }).orFail();
    expect(stored).toMatchObject({ device: "Pixel 8", osVersion: "14", screen: "Home", handled: false });
    expect(stored.breadcrumbs).toHaveLength(1);
  });

  it("groups the same crash after a rebuild moves its lines", async () => {
    const event = anEvent();
    await report(event);
    await report({ ...event, stack: event.stack.replace(/:1:\d+/, ":1:777777") });

    const group = await groupOf(event);
    expect(group.eventCount).toBe(2);
    expect(await ErrorEvent.countDocuments({ groupId: group._id })).toBe(2);
  });

  it("takes a batch, as the mobile app sends its queue after a crash", async () => {
    const first = anEvent();
    const second = anEvent();
    const res = await report({ events: [first, second] });

    expect(res.body).toEqual({ accepted: 2 });
    expect((await groupOf(first)).eventCount).toBe(1);
    expect((await groupOf(second)).eventCount).toBe(1);
  });

  it("takes the user from a valid token over the body", async () => {
    const person = await aUser();
    const event = anEvent({ userId: "someone-else" });
    await report(event, person.token);

    const group = await groupOf(event);
    expect(group.userIds).toEqual([person.id]);
  });

  it("rejects an event too big to store", async () => {
    const res = await report(anEvent({ details: { blob: "x".repeat(5_000) } }));
    expect(res.status).toBe(400);
  });

  it("limits one caller flooding the endpoint", async () => {
    const address = freshIp();
    const flood = () =>
      request(app)
        .post("/api/errors/events")
        .set("x-forwarded-for", address)
        .send({ events: Array.from({ length: 10 }, () => anEvent()) });

    const statuses: number[] = [];
    for (let i = 0; i < 14; i += 1) statuses.push((await flood()).status);
    expect(statuses.slice(0, 12).every((status) => status === 202)).toBe(true);
    expect(statuses).toContain(429);
  });
});

describe("who may read errors", () => {
  it("turns away a signed-in user who isn't on the team", async () => {
    const outsider = await aUser();
    expect((await outsider.as("get", "/api/errors/groups")).status).toBe(403);
  });

  it("turns away a developer still waiting for approval", async () => {
    const waiting = await aUser();
    const registered = await waiting.as("post", "/api/errors/developers/register");

    expect(registered.status).toBe(201);
    expect(registered.body.status).toBe("pending");
    expect((await waiting.as("get", "/api/errors/groups")).status).toBe(403);
  });

  it("lets a Sparkler admin in without registering, as a team admin", async () => {
    const admin = await anAdmin();
    const me = await admin.as("get", "/api/errors/developers/me");
    expect(me.body).toMatchObject({ role: "admin", status: "active" });
    expect((await admin.as("get", "/api/errors/groups")).status).toBe(200);
  });
});

describe("the team", () => {
  it("emails admins when someone asks to join, and the person once approved", async () => {
    const admin = await anAdmin();
    const person = await aUser();
    const registered = await person.as("post", "/api/errors/developers/register");
    await settle();
    expect(mailsSent().some((m) => m.to === admin.email && m.subject.includes("asked to join"))).toBe(true);

    vi.clearAllMocks();
    const approved = await admin.as("patch", `/api/errors/developers/${registered.body.id}`).send({ status: "active" });
    await settle();
    expect(approved.body.status).toBe("active");
    expect(mailsSent().map((m) => m.to)).toEqual([person.email]);
    expect((await person.as("get", "/api/errors/groups")).status).toBe(200);
  });

  it("lets only a team admin approve, and nobody change their own access", async () => {
    const admin = await anAdmin();
    const developer = await aDeveloper(admin);
    const other = await aUser();
    const registered = await other.as("post", "/api/errors/developers/register");

    expect(
      (await developer.as("patch", `/api/errors/developers/${registered.body.id}`).send({ status: "active" })).status,
    ).toBe(403);
    expect(
      (await admin.as("patch", `/api/errors/developers/${admin.developerId}`).send({ status: "removed" })).status,
    ).toBe(400);
  });

  it("locks a removed developer out on their next request", async () => {
    const admin = await anAdmin();
    const developer = await aDeveloper(admin);
    await admin.as("patch", `/api/errors/developers/${developer.developerId}`).send({ status: "removed" });
    expect((await developer.as("get", "/api/errors/groups")).status).toBe(403);
  });
});

describe("assigning an error", () => {
  async function anOpenGroup() {
    const event = anEvent();
    await report(event);
    return (await groupOf(event))._id.toString();
  }

  it("emails the assignee, and the assigner when they accept", async () => {
    const admin = await anAdmin();
    const developer = await aDeveloper(admin);
    const id = await anOpenGroup();

    vi.clearAllMocks();
    const assigned = await admin.as("post", `/api/errors/groups/${id}/assign`).send({ developerId: developer.developerId });
    await settle();
    expect(assigned.body.assignee).toMatchObject({ developerId: developer.developerId, state: "pending" });
    expect(mailsSent().map((m) => m.to)).toEqual([developer.email]);
    expect(mailsSent()[0]?.message).toContain("TypeError");

    vi.clearAllMocks();
    const accepted = await developer.as("post", `/api/errors/groups/${id}/assignment/accept`);
    await settle();
    expect(accepted.body.assignee.state).toBe("accepted");
    expect(mailsSent().map((m) => m.to)).toEqual([admin.email]);
    expect(mailsSent()[0]?.subject).toContain("accepted");
  });

  it("puts a rejected error back in the pool and tells the assigner why", async () => {
    const admin = await anAdmin();
    const developer = await aDeveloper(admin);
    const id = await anOpenGroup();
    await admin.as("post", `/api/errors/groups/${id}/assign`).send({ developerId: developer.developerId });

    vi.clearAllMocks();
    const rejected = await developer
      .as("post", `/api/errors/groups/${id}/assignment/reject`)
      .send({ reason: "I'm on leave this week" });
    await settle();

    expect(rejected.body.assignee).toBeNull();
    expect(mailsSent().map((m) => m.to)).toEqual([admin.email]);
    expect(mailsSent()[0]?.message).toContain("I'm on leave this week");
    expect(rejected.body.timeline.at(-1)).toMatchObject({ kind: "rejected", body: "I'm on leave this week" });
  });

  it("lets only the assignee answer", async () => {
    const admin = await anAdmin();
    const developer = await aDeveloper(admin);
    const bystander = await aDeveloper(admin);
    const id = await anOpenGroup();
    await admin.as("post", `/api/errors/groups/${id}/assign`).send({ developerId: developer.developerId });

    expect((await bystander.as("post", `/api/errors/groups/${id}/assignment/accept`)).status).toBe(403);
    expect((await bystander.as("post", `/api/errors/groups/${id}/resolve`)).status).toBe(403);
  });

  it("records who resolved it and emails the assigner", async () => {
    const admin = await anAdmin();
    const developer = await aDeveloper(admin);
    const id = await anOpenGroup();
    await admin.as("post", `/api/errors/groups/${id}/assign`).send({ developerId: developer.developerId });
    await developer.as("post", `/api/errors/groups/${id}/assignment/accept`);

    vi.clearAllMocks();
    const resolved = await developer.as("post", `/api/errors/groups/${id}/resolve`).send({ note: "Null-checked the feed" });
    await settle();

    expect(resolved.body).toMatchObject({
      status: "resolved",
      resolvedBy: { developerId: developer.developerId },
      resolvedInVersion: "3.0.8",
      resolutionNote: "Null-checked the feed",
    });
    expect(mailsSent().map((m) => m.to)).toEqual([admin.email]);
    expect(mailsSent()[0]?.message).toContain("Null-checked the feed");

    const stats = await admin.as("get", "/api/errors/developers/stats");
    const mine = stats.body.find((row: { developer: { id: string } }) => row.developer.id === developer.developerId);
    expect(mine).toMatchObject({ resolved: 1, open: 0 });
  });

  it("sends nothing when someone takes an error themselves", async () => {
    const admin = await anAdmin();
    const developer = await aDeveloper(admin);
    const id = await anOpenGroup();

    vi.clearAllMocks();
    const taken = await developer.as("post", `/api/errors/groups/${id}/assign`).send({ developerId: developer.developerId });
    await settle();
    expect(taken.body.assignee.state).toBe("accepted");
    expect(mailsSent()).toEqual([]);
  });

  it("finds a developer's own errors with assignee=me", async () => {
    const admin = await anAdmin();
    const developer = await aDeveloper(admin);
    const id = await anOpenGroup();
    await admin.as("post", `/api/errors/groups/${id}/assign`).send({ developerId: developer.developerId });

    const mine = await developer.as("get", "/api/errors/groups?assignee=me");
    expect(mine.body.groups.map((group: { id: string }) => group.id)).toEqual([id]);
  });
});

describe("a resolved error coming back", () => {
  it("reopens when a newer version hits it, and clears who fixed it but keeps the history", async () => {
    const admin = await anAdmin();
    const event = anEvent();
    await report(event);
    const id = (await groupOf(event))._id.toString();
    await admin.as("post", `/api/errors/groups/${id}/resolve`);

    await report({ ...event, appVersion: "3.0.8" });
    expect((await groupOf(event)).status).toBe("resolved");

    await report({ ...event, appVersion: "3.0.9" });
    const group = await groupOf(event);
    expect(group).toMatchObject({ status: "open", regressed: true, resolvedBy: null });
    expect(group.timeline.map((entry) => entry.kind)).toEqual(["created", "resolved", "regressed"]);
  });
});

describe("reading errors", () => {
  it("lists groups with a trend, and a group's events, breakdown and stats", async () => {
    const admin = await anAdmin();
    const event = anEvent({ app: "web", platform: "web", browser: "Chrome", os: "macOS" });
    await report(event);
    await report({ ...event, browser: "Safari" });
    const id = (await groupOf(event))._id.toString();

    const list = await admin.as("get", "/api/errors/groups?app=web&q=" + encodeURIComponent(event.message));
    expect(list.body.groups).toHaveLength(1);
    expect(list.body.groups[0]).toMatchObject({ id, eventCount: 2 });
    expect(list.body.groups[0].trend.at(-1)).toBe(2);
    expect(list.body.groups[0]).not.toHaveProperty("userIds");

    const events = await admin.as("get", `/api/errors/groups/${id}/events?limit=1`);
    expect(events.body.events).toHaveLength(1);
    expect(events.body.nextCursor).toEqual(expect.any(String));

    const breakdown = await admin.as("get", `/api/errors/groups/${id}/breakdown`);
    expect(breakdown.body.breakdown.browser).toEqual(
      expect.arrayContaining([{ key: "Chrome", count: 1 }, { key: "Safari", count: 1 }]),
    );
    expect(breakdown.body.occurrences.at(-1).count).toBe(2);

    const stats = await admin.as("get", "/api/errors/stats?range=24h&app=web");
    expect(stats.body.totals.events).toBeGreaterThanOrEqual(2);
    expect(stats.body.timeline.length).toBeGreaterThan(0);
    expect(stats.body.topGroups.length).toBeGreaterThan(0);
  });

  it("bulk-ignores errors", async () => {
    const admin = await anAdmin();
    const first = anEvent();
    const second = anEvent();
    await report({ events: [first, second] });
    const ids = [(await groupOf(first))._id.toString(), (await groupOf(second))._id.toString()];

    const res = await admin.as("post", "/api/errors/groups/bulk-status").send({ ids, status: "ignored" });
    expect(res.body.updated.sort()).toEqual([...ids].sort());
    expect((await groupOf(first)).status).toBe("ignored");
  });

  it("adds comments to the timeline", async () => {
    const admin = await anAdmin();
    const event = anEvent();
    await report(event);
    const id = (await groupOf(event))._id.toString();

    const res = await admin.as("post", `/api/errors/groups/${id}/comments`).send({ body: "Only on Pixel phones" });
    expect(res.status).toBe(201);
    expect(res.body.timeline.at(-1)).toMatchObject({ kind: "comment", body: "Only on Pixel phones" });
  });
});

describe("developer records", () => {
  it("are separate from the profile, so nobody makes themselves a developer", async () => {
    const person = await aUser();
    await person.as("patch", "/api/sparklers").send({ role: "admin", status: "active", isAdmin: true });
    expect(await Developer.findOne({ sparklerId: person.id })).toBeNull();
    expect((await person.as("get", "/api/errors/groups")).status).toBe(403);
  });

  it("drop a deleted account's email and access, and keep the record for history", async () => {
    const admin = await anAdmin();
    const developer = await aDeveloper(admin);
    await request(app).delete("/api/sparklers").set("x-auth-token", developer.token);

    const record = await Developer.findById(developer.developerId).orFail();
    expect(record).toMatchObject({ status: "removed", name: "Deleted account", email: "" });
  });
});
