import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { isUniversityEmail } from "../../src/domain/studentEmail.js";
import { StudentEmailCode } from "../../src/models/studentEmailCode.js";
import { Sparkler } from "../../src/models/sparkler.js";

const mail = vi.hoisted(() => ({
  sendMail: vi.fn(async (_input: { to: string; message: string }) => ({ data: {}, error: null as unknown })),
}));
vi.mock("../../src/services/mail.js", async (original) => ({
  ...(await original<object>()),
  sendMail: mail.sendMail,
}));

let app: Application;
let count = 0;

async function aUser() {
  count += 1;
  const user = await new Sparkler({
    email: `student-${count}-${Date.now()}@example.com`,
    custom: { username: `student${count}${Date.now()}` },
  }).save();
  const id = user._id.toString();
  const token = jwt.sign({ id, custom: {} }, process.env.jwtPrivateKey as string);
  return {
    id,
    post: (path: string, body: object) =>
      request(app).post(`/api/studentVerification${path}`).set("x-auth-token", token).send(body),
    get: (path: string) =>
      request(app).get(`/api/studentVerification${path}`).set("x-auth-token", token),
    patchProfile: (custom: object) =>
      request(app).patch("/api/sparklers").set("x-auth-token", token).send(custom),
  };
}

const address = () => `s${++count}${Date.now()}@students.uonbi.ac.ke`;
const lastCode = () => /(\d{6})/.exec(mail.sendMail.mock.calls.at(-1)?.[0].message ?? "")?.[1] as string;
const wrongCodeFor = (code: string) => (code === "000000" ? "000001" : "000000");

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  await Sparkler.init();
  await StudentEmailCode.init();
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

beforeEach(() => {
  mail.sendMail.mockClear();
  mail.sendMail.mockResolvedValue({ data: {}, error: null });
});

describe("isUniversityEmail", () => {
  it.each(["a@students.uonbi.ac.ke", "a@ox.ac.uk", "a@mit.edu", "a@unsw.edu.au", "A@KISII.AC.KE"])(
    "accepts %s",
    (email) => expect(isUniversityEmail(email)).toBe(true),
  );

  it.each(["a@gmail.com", "a@edu.example.com", "a@ac.ke.evil.com", "a@fakeedu", "nothing"])(
    "refuses %s",
    (email) => expect(isUniversityEmail(email)).toBe(false),
  );
});

describe("verifying a student email", () => {
  it("needs a signed-in caller", async () => {
    const { status } = await request(app).post("/api/studentVerification").send({ email: address() });
    expect(status).toBe(401);
  });

  it("refuses an address that isn't a university's, and sends nothing", async () => {
    const user = await aUser();
    const { status } = await user.post("", { email: "me@gmail.com" });
    expect(status).toBe(400);
    expect(mail.sendMail).not.toHaveBeenCalled();
  });

  it("verifies the account with the code that was mailed", async () => {
    const user = await aUser();
    const email = address();
    expect((await user.post("", { email })).status).toBe(202);
    expect(mail.sendMail.mock.calls[0]?.[0].to).toBe(email);

    expect((await user.get("/me")).body).toEqual({ studentVerified: false });
    const { status, body } = await user.post("/confirm", { code: lastCode() });
    expect(status).toBe(200);
    expect(body).toEqual({ studentVerified: true });
    expect((await user.get("/me")).body).toEqual({ studentVerified: true });
  });

  it("never stores the code itself", async () => {
    const user = await aUser();
    await user.post("", { email: address() });
    const pending = await StudentEmailCode.findOne({ userId: user.id });
    expect(pending?.codeHash).not.toContain(lastCode());
    expect(pending?.codeHash).toHaveLength(64);
  });

  it("refuses a wrong code, then gives up after five tries", async () => {
    const user = await aUser();
    await user.post("", { email: address() });
    const wrong = wrongCodeFor(lastCode());
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await user.post("/confirm", { code: wrong })).status).toBe(400);
    }
    expect((await user.post("/confirm", { code: lastCode() })).status).toBe(429);
    expect((await user.get("/me")).body).toEqual({ studentVerified: false });
  });

  it("doesn't accept someone else's code", async () => {
    const owner = await aUser();
    const other = await aUser();
    await owner.post("", { email: address() });
    const ownersCode = lastCode();
    await other.post("", { email: address() });
    const othersCode = lastCode();
    // Codes are random, so on the rare day they match there's nothing to test.
    if (ownersCode === othersCode) return;
    expect((await other.post("/confirm", { code: ownersCode })).status).toBe(400);
  });

  it("makes you wait before asking for another code", async () => {
    const user = await aUser();
    const email = address();
    await user.post("", { email });
    expect((await user.post("", { email })).status).toBe(429);
    expect(mail.sendMail).toHaveBeenCalledOnce();
  });

  it("lets one address verify only one account", async () => {
    const first = await aUser();
    const second = await aUser();
    const email = address();
    await first.post("", { email });
    await first.post("/confirm", { code: lastCode() });
    expect((await second.post("", { email })).status).toBe(409);
  });

  it("says so when the mail fails, and leaves no code behind", async () => {
    const user = await aUser();
    mail.sendMail.mockResolvedValueOnce({ data: {}, error: new Error("resend down") });
    const { status } = await user.post("", { email: address() });
    expect(status).toBeGreaterThanOrEqual(500);
    expect(await StudentEmailCode.findOne({ userId: user.id })).toBeNull();
  });

  it("can't be claimed through a profile edit, and shows as a badge without the address", async () => {
    const user = await aUser();
    await user.patchProfile({ custom: { studentVerified: true, studentEmail: "x@mit.edu" } });
    const before = await Sparkler.findById(user.id).lean();
    expect(before?.studentVerifiedAt).toBeUndefined();

    const email = address();
    await user.post("", { email });
    await user.post("/confirm", { code: lastCode() });

    const { body } = await request(app).get("/api/sparklers");
    const listed = (body as { id: string }[]).find((person) => person.id === user.id);
    expect(listed).toMatchObject({ studentVerified: true });
    expect(JSON.stringify(listed)).not.toContain(email);
  });
});
