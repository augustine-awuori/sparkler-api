import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { Issue } from "../../src/models/issue.js";
import { Sparkler } from "../../src/models/sparkler.js";

const mail = vi.hoisted(() => ({ sendMailBatch: vi.fn(async () => ({ sent: 1, failed: 0 })) }));
vi.mock("../../src/services/mail.js", async (original) => ({
  ...(await original<object>()),
  sendMailBatch: mail.sendMailBatch,
}));

let app: Application;
let count = 0;

async function aUser(custom: Record<string, unknown> = {}) {
  count += 1;
  const user = await new Sparkler({
    email: `issues-${count}-${Date.now()}@example.com`,
    name: `Person ${count}`,
    custom: { username: `person${count}${Date.now()}`, ...custom },
  }).save();
  const id = user._id.toString();
  const token = jwt.sign({ id, custom: {} }, process.env.jwtPrivateKey as string);
  const as = (method: "get" | "post" | "patch", path: string) =>
    request(app)[method](path).set("x-auth-token", token);
  return { id, name: user.name, username: user.custom.username, as };
}

const REPORT = {
  type: "bug",
  title: "The feed won't load",
  description: "It spins forever on Following.",
  source: "mobile",
  context: { platform: "android", appVersion: "1.2.3", screen: "Home" },
};

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(() => vi.clearAllMocks());

describe("reporting an issue", () => {
  it("creates it with a reference, and takes the reporter from the token", async () => {
    const reporter = await aUser();

    const res = await reporter.as("post", "/api/issues").send({
      ...REPORT,
      reportedBy: { userId: "someone-else", name: "Forged" },
      status: "closed",
      priority: "urgent",
    });

    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^SPK-\d+$/);
    expect(res.body.status).toBe("open");

    const stored = await Issue.findById(res.body.id);
    expect(stored?.reportedBy).toMatchObject({
      userId: reporter.id,
      name: reporter.name,
      username: reporter.username,
    });
    expect(stored?.priority).toBe("normal");
    expect(stored?.context.appVersion).toBe("1.2.3");
    expect(stored?.timeline[0]?.kind).toBe("created");
  });

  it("gives every issue its own reference, even at the same moment", async () => {
    const reporter = await aUser();
    const responses = await Promise.all(
      [1, 2, 3].map(() => reporter.as("post", "/api/issues").send(REPORT)),
    );
    const references = responses.map((res) => res.body.reference as string);
    expect(new Set(references).size).toBe(3);
  });

  it.each([
    ["an unknown type", { ...REPORT, type: "rant" }],
    ["no description", { ...REPORT, description: "  " }],
    ["a query operator for a title", { ...REPORT, title: { $ne: null } }],
    ["an unknown source", { ...REPORT, source: "fax" }],
  ])("refuses %s", async (_label, body) => {
    const reporter = await aUser();
    expect((await reporter.as("post", "/api/issues").send(body)).status).toBe(400);
  });

  it("needs a signed-in caller", async () => {
    expect((await request(app).post("/api/issues").send(REPORT)).status).toBe(401);
  });

  it("limits how many one person can send", async () => {
    const reporter = await aUser();
    for (let sent = 0; sent < 5; sent += 1) {
      expect((await reporter.as("post", "/api/issues").send(REPORT)).status).toBe(201);
    }
    expect((await reporter.as("post", "/api/issues").send(REPORT)).status).toBe(429);
  });

  it("emails each admin, and still saves when the mail fails", async () => {
    const admin = await aUser({ isAdmin: true });
    const reporter = await aUser();
    mail.sendMailBatch.mockRejectedValueOnce(new Error("Resend is down"));

    const res = await reporter.as("post", "/api/issues").send(REPORT);

    expect(res.status).toBe(201);
    await vi.waitFor(() => expect(mail.sendMailBatch).toHaveBeenCalled());
    const [mails] = mail.sendMailBatch.mock.calls[0] as unknown as [{ subject: string }[]];
    expect(mails.length).toBeGreaterThan(0);
    expect(mails[0]?.subject).toContain(res.body.reference);
    expect(admin.id).toBeDefined();
  });
});

describe("what a reporter can see", () => {
  it("lists only their own issues", async () => {
    const reporter = await aUser();
    const other = await aUser();
    await reporter.as("post", "/api/issues").send(REPORT);
    await other.as("post", "/api/issues").send(REPORT);

    const res = await reporter.as("get", "/api/issues/mine");

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it("hides internal notes, the handler and the priority from them", async () => {
    const admin = await aUser({ isAdmin: true });
    const reporter = await aUser();
    const { body: created } = await reporter.as("post", "/api/issues").send(REPORT);
    const path = `/api/issues/${created.id}`;

    await admin.as("post", `${path}/notes`).send({ body: "Probably spam", visibility: "internal" });
    await admin.as("post", `${path}/notes`).send({ body: "Looking at it", visibility: "reporter" });
    await admin.as("patch", path).send({ handledBy: admin.id, priority: "high" });

    const { body: seen } = await reporter.as("get", path);

    expect(JSON.stringify(seen)).not.toContain("Probably spam");
    expect(seen.timeline.map((entry: { body?: string }) => entry.body)).toContain("Looking at it");
    expect(seen.handledBy).toBeUndefined();
    expect(seen.priority).toBeUndefined();
    expect(seen.reportedBy).toBeUndefined();
    expect(seen.timeline.every((entry: { actorId?: string }) => !entry.actorId)).toBe(true);
  });

  it("doesn't confirm that someone else's issue exists", async () => {
    const reporter = await aUser();
    const other = await aUser();
    const { body: created } = await reporter.as("post", "/api/issues").send(REPORT);

    expect((await other.as("get", `/api/issues/${created.id}`)).status).toBe(404);
    expect((await other.as("get", "/api/issues/not-an-id")).status).toBe(404);
  });
});

describe("working on an issue", () => {
  it.each([
    ["list", "get", "/api/issues"],
    ["change", "patch", "/api/issues/64b000000000000000000009"],
    ["annotate", "post", "/api/issues/64b000000000000000000009/notes"],
  ] as const)("refuses to let a non-admin %s", async (_label, method, path) => {
    const user = await aUser();
    expect((await user.as(method, path).send({})).status).toBe(403);
  });

  it("records who handles it and each change, on the timeline", async () => {
    const admin = await aUser({ isAdmin: true });
    const reporter = await aUser();
    const { body: created } = await reporter.as("post", "/api/issues").send(REPORT);

    const res = await admin
      .as("patch", `/api/issues/${created.id}`)
      .send({ status: "in_progress", priority: "high", handledBy: admin.id });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "in_progress",
      priority: "high",
      reportedBy: { userId: reporter.id },
      handledBy: { userId: admin.id, name: admin.name },
    });
    const kinds = res.body.timeline.map((entry: { kind: string }) => entry.kind);
    expect(kinds).toEqual(["created", "status_changed", "priority_changed", "assigned"]);
    expect(res.body.timeline[1]).toMatchObject({
      actorId: admin.id,
      from: "open",
      to: "in_progress",
      visibility: "reporter",
    });
  });

  it("records a resolution, and clears it if the issue is reopened", async () => {
    const admin = await aUser({ isAdmin: true });
    const reporter = await aUser();
    const { body: created } = await reporter.as("post", "/api/issues").send(REPORT);
    const path = `/api/issues/${created.id}`;

    const resolved = await admin
      .as("patch", path)
      .send({ status: "resolved", resolutionSummary: "Fixed in 1.2.4" });
    expect(resolved.body.resolution).toMatchObject({
      summary: "Fixed in 1.2.4",
      resolvedBy: admin.id,
    });

    const reopened = await admin.as("patch", path).send({ status: "open" });
    expect(reopened.body.resolution).toBeNull();
  });

  it("can take an issue off whoever had it, and refuses a handler who doesn't exist", async () => {
    const admin = await aUser({ isAdmin: true });
    const reporter = await aUser();
    const { body: created } = await reporter.as("post", "/api/issues").send(REPORT);
    const path = `/api/issues/${created.id}`;

    await admin.as("patch", path).send({ handledBy: admin.id });
    const cleared = await admin.as("patch", path).send({ handledBy: null });
    expect(cleared.body.handledBy).toBeNull();

    const missing = await admin
      .as("patch", path)
      .send({ handledBy: "64b00000000000000000000f" });
    expect(missing.status).toBe(404);
  });

  it("refuses a change that changes nothing", async () => {
    const admin = await aUser({ isAdmin: true });
    const reporter = await aUser();
    const { body: created } = await reporter.as("post", "/api/issues").send(REPORT);
    expect((await admin.as("patch", `/api/issues/${created.id}`).send({})).status).toBe(400);
  });

  it("filters and pages the list for the team", async () => {
    const admin = await aUser({ isAdmin: true });
    const reporter = await aUser();
    await reporter.as("post", "/api/issues").send(REPORT);
    const { body: second } = await reporter.as("post", "/api/issues").send(REPORT);
    await admin.as("patch", `/api/issues/${second.id}`).send({ status: "triaged", handledBy: admin.id });

    const triaged = await admin.as("get", "/api/issues").query({ status: "triaged", handledBy: admin.id });
    expect(triaged.body.issues.map((issue: { id: string }) => issue.id)).toContain(second.id);

    const firstPage = await admin.as("get", "/api/issues").query({ limit: 1 });
    expect(firstPage.body.issues).toHaveLength(1);
    expect(firstPage.body.nextCursor).toEqual(firstPage.body.issues[0].id);

    const nextPage = await admin
      .as("get", "/api/issues")
      .query({ limit: 1, cursor: firstPage.body.nextCursor });
    expect(nextPage.body.issues[0].id).not.toBe(firstPage.body.issues[0].id);
  });
});

describe("deleting an account", () => {
  it("removes the reporter's name from their issues and keeps the issues", async () => {
    const reporter = await aUser();
    const { body: created } = await reporter.as("post", "/api/issues").send(REPORT);

    const token = jwt.sign({ id: reporter.id, custom: {} }, process.env.jwtPrivateKey as string);
    await request(app).delete("/api/sparklers").set("x-auth-token", token);

    const stored = await Issue.findById(created.id);
    expect(stored?.title).toBe(REPORT.title);
    expect(stored?.reportedBy).toMatchObject({ name: "Deleted account", username: "" });
  });
});
