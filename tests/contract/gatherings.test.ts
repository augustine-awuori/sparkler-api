import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { communitySlug } from "../../src/domain/gathering.types.js";
import { CampusEvent, EventRsvp } from "../../src/models/campusEvent.js";
import { Community, CommunityMember } from "../../src/models/community.js";
import { Sparkler } from "../../src/models/sparkler.js";
import { forgetGatheringsOf } from "../../src/services/gatherings.js";

let app: Application;
let count = 0;

async function aUser(custom: Record<string, unknown> = {}) {
  count += 1;
  const user = await new Sparkler({
    email: `gather-${count}-${Date.now()}@example.com`,
    custom: { username: `gather${count}${Date.now()}`, ...custom },
  }).save();
  const id = user._id.toString();
  const token = jwt.sign({ id, custom: {} }, process.env.jwtPrivateKey as string);
  const call = (method: "get" | "post" | "put" | "delete", path: string) =>
    request(app)[method](`/api${path}`).set("x-auth-token", token);
  return { id, call };
}

const nextWeek = () => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

const SOCIETY = { name: "Chess Society", description: "Saturdays at the library" };
const eventFields = () => ({ title: "Chess night", place: "Library", startsAt: nextWeek() });

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  await Promise.all([Community.init(), CommunityMember.init(), CampusEvent.init(), EventRsvp.init()]);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

describe("communitySlug", () => {
  it("reads well in a link and differs for the same name", () => {
    expect(communitySlug("Chess  Society!", () => 0.5)).toMatch(/^chess-society-/);
    expect(communitySlug("!!!", () => 0.5)).toMatch(/^community-/);
    expect(communitySlug("Chess")).not.toBe(communitySlug("Chess"));
  });
});

describe("communities", () => {
  it("needs a signed-in caller", async () => {
    expect((await request(app).get("/api/communities")).status).toBe(401);
    expect((await request(app).post("/api/events").send(eventFields())).status).toBe(401);
  });

  it("makes its creator the first member", async () => {
    const maker = await aUser();
    const { status, body } = await maker.call("post", "/communities").send(SOCIETY);
    expect(status).toBe(201);
    expect(body).toMatchObject({ name: "Chess Society", memberCount: 1, joined: true, createdBy: maker.id });
  });

  it("refuses a name that's too short", async () => {
    const maker = await aUser();
    expect((await maker.call("post", "/communities").send({ name: "x" })).status).toBe(400);
  });

  it("counts joining twice once, and leaving twice once", async () => {
    const maker = await aUser();
    const member = await aUser();
    const { body } = await maker.call("post", "/communities").send(SOCIETY);
    const path = `/communities/${body.slug}/membership`;

    await member.call("put", path);
    const twice = await member.call("put", path);
    expect(twice.body).toMatchObject({ memberCount: 2, joined: true });

    await member.call("delete", path);
    const left = await member.call("delete", path);
    expect(left.body).toMatchObject({ memberCount: 1, joined: false });
  });

  it("keeps the count right when joins race", async () => {
    const maker = await aUser();
    const member = await aUser();
    const { body } = await maker.call("post", "/communities").send(SOCIETY);
    const path = `/communities/${body.slug}/membership`;
    await Promise.all(Array.from({ length: 5 }, () => member.call("put", path)));
    expect((await member.call("get", `/communities/${body.slug}`)).body.memberCount).toBe(2);
  });

  it("lists mine, and filters by school", async () => {
    const school = "507f1f77bcf86cd799439011";
    const maker = await aUser();
    const stranger = await aUser();
    const { body } = await maker.call("post", "/communities").send({ ...SOCIETY, school });

    const mine = await maker.call("get", "/communities?mine=true");
    expect(mine.body.map((c: { slug: string }) => c.slug)).toContain(body.slug);
    const theirs = await stranger.call("get", "/communities?mine=true");
    expect(theirs.body.map((c: { slug: string }) => c.slug)).not.toContain(body.slug);
    const atSchool = await stranger.call("get", `/communities?school=${school}`);
    expect(atSchool.body.map((c: { slug: string }) => c.slug)).toContain(body.slug);
  });

  it("only lets its creator or an admin remove it", async () => {
    const maker = await aUser();
    const stranger = await aUser();
    const admin = await aUser({ isAdmin: true });

    const first = (await maker.call("post", "/communities").send(SOCIETY)).body;
    expect((await stranger.call("delete", `/communities/${first.slug}`)).status).toBe(403);
    expect((await maker.call("delete", `/communities/${first.slug}`)).status).toBe(200);
    expect(await CommunityMember.countDocuments({ communityId: first.id })).toBe(0);

    const second = (await maker.call("post", "/communities").send(SOCIETY)).body;
    expect((await admin.call("delete", `/communities/${second.slug}`)).status).toBe(200);
  });

  it("limits how many one person can start in a day", async () => {
    const maker = await aUser();
    for (let i = 0; i < 3; i += 1) {
      expect((await maker.call("post", "/communities").send(SOCIETY)).status).toBe(201);
    }
    expect((await maker.call("post", "/communities").send(SOCIETY)).status).toBe(429);
  });
});

describe("events", () => {
  it("creates one with its maker going", async () => {
    const maker = await aUser();
    const { status, body } = await maker.call("post", "/events").send(eventFields());
    expect(status).toBe(201);
    expect(body).toMatchObject({ title: "Chess night", goingCount: 1, going: true });
  });

  it("refuses one in the past, or that ends before it starts", async () => {
    const maker = await aUser();
    const past = { ...eventFields(), startsAt: "2020-01-01T10:00:00.000Z" };
    expect((await maker.call("post", "/events").send(past)).status).toBe(400);
    const backwards = { ...eventFields(), endsAt: "2020-01-01T10:00:00.000Z" };
    expect((await maker.call("post", "/events").send(backwards)).status).toBe(400);
  });

  it("counts going twice once", async () => {
    const maker = await aUser();
    const guest = await aUser();
    const { body } = await maker.call("post", "/events").send(eventFields());
    await guest.call("put", `/events/${body.id}/rsvp`);
    const twice = await guest.call("put", `/events/${body.id}/rsvp`);
    expect(twice.body).toMatchObject({ goingCount: 2, going: true });
    const out = await guest.call("delete", `/events/${body.id}/rsvp`);
    expect(out.body).toMatchObject({ goingCount: 1, going: false });
  });

  it("lists upcoming ones soonest first, and leaves finished ones out", async () => {
    const maker = await aUser();
    const community = `soonest-${Date.now()}`;
    const later = new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString();
    const { body: second } = await maker.call("post", "/events").send({ ...eventFields(), startsAt: later, community });
    const { body: first } = await maker.call("post", "/events").send({ ...eventFields(), community });
    await CampusEvent.create({
      title: "Over",
      place: "Hall",
      startsAt: new Date("2020-01-01"),
      endsAt: new Date("2020-01-02"),
      createdBy: maker.id,
      community,
    });

    const { body } = await maker.call("get", `/events?community=${community}`);
    expect(body.map((e: { id: string }) => e.id)).toEqual([first.id, second.id]);
  });

  it("only lets its creator or an admin remove it, and answers 404 after", async () => {
    const maker = await aUser();
    const stranger = await aUser();
    const { body } = await maker.call("post", "/events").send(eventFields());
    expect((await stranger.call("delete", `/events/${body.id}`)).status).toBe(403);
    expect((await maker.call("delete", `/events/${body.id}`)).status).toBe(200);
    expect((await stranger.call("put", `/events/${body.id}/rsvp`)).status).toBe(404);
    expect((await stranger.call("put", "/events/not-an-id/rsvp")).status).toBe(404);
  });
});

describe("deleting an account", () => {
  it("comes off every count", async () => {
    const maker = await aUser();
    const leaving = await aUser();
    const community = (await maker.call("post", "/communities").send(SOCIETY)).body;
    const event = (await maker.call("post", "/events").send(eventFields())).body;
    await leaving.call("put", `/communities/${community.slug}/membership`);
    await leaving.call("put", `/events/${event.id}/rsvp`);

    await forgetGatheringsOf(leaving.id);

    expect((await Community.findById(community.id))?.memberCount).toBe(1);
    expect((await CampusEvent.findById(event.id))?.goingCount).toBe(1);
  });
});
