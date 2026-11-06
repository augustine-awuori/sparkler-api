import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { Sparkler } from "../../src/models/sparkler.js";

let app: Application;

async function aStudent() {
  const user = await new Sparkler({
    email: `alumni-${Math.random()}@example.com`,
    name: "Ada",
    custom: { username: `ada${Date.now()}${Math.floor(Math.random() * 1000)}`, year: "3" },
  }).save();
  const token = jwt.sign(
    { id: user._id.toString(), custom: {} },
    process.env.jwtPrivateKey as string,
  );
  const patch = (custom: Record<string, unknown>) =>
    request(app).patch("/api/sparklers").set("x-auth-token", token).send({ custom });
  return { id: user._id.toString(), patch };
}

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

describe("alumni status on a profile", () => {
  it("saves it and returns it from the public directory", async () => {
    const { id, patch } = await aStudent();

    const res = await patch({ studentStatus: "alumni", graduationYear: "2021", year: "" });
    expect(res.status).toBe(200);

    const directory = await request(app).get(`/api/sparklers/${id}`);
    expect(directory.body.custom).toMatchObject({
      studentStatus: "alumni",
      graduationYear: "2021",
      year: "",
    });
  });

  it("leaves the graduation year optional", async () => {
    const { patch } = await aStudent();
    expect((await patch({ studentStatus: "alumni" })).status).toBe(200);
    expect((await patch({ studentStatus: "alumni", graduationYear: "" })).status).toBe(200);
  });

  it("doesn't touch a year of study it wasn't given", async () => {
    const { id, patch } = await aStudent();
    await patch({ studentStatus: "student" });
    const stored = await Sparkler.findById(id).lean();
    expect(stored?.custom.year).toBe("3");
  });

  it.each([
    ["an unknown status", { studentStatus: "professor" }],
    ["a status that isn't a string", { studentStatus: { $ne: null } }],
    ["a year that isn't four digits", { graduationYear: "21" }],
    ["a year that isn't a number", { graduationYear: "soon" }],
    ["a year too long ago", { graduationYear: "1800" }],
    ["a year that hasn't happened", { graduationYear: String(new Date().getFullYear() + 1) }],
  ])("refuses %s without saving it", async (_label, custom) => {
    const { id, patch } = await aStudent();
    expect((await patch(custom)).status).toBe(400);

    const stored = await Sparkler.findById(id).lean();
    expect(stored?.custom.studentStatus).toBeUndefined();
    expect(stored?.custom.graduationYear).toBeUndefined();
  });
});
