import { createHmac, randomInt, timingSafeEqual } from "node:crypto";

import { config } from "../config/index.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  TooManyRequestsError,
  UpstreamError,
} from "../domain/errors.js";
import { StudentEmailCode } from "../models/studentEmailCode.js";
import { Sparkler } from "../models/sparkler.js";
import { sendMail } from "./mail.js";

const CODE_LIFETIME_MS = 15 * 60 * 1000;
const RESEND_AFTER_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

/** Hashed, so a database leak doesn't hand out codes for accounts mid-verification. */
function hashOf(userId: string, code: string): string {
  return createHmac("sha256", config().jwtSecret).update(`${userId}:${code}`).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function newStudentCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** One university address stands behind one account, or the badge means nothing. */
async function assertAddressIsFree(email: string, userId: string) {
  const holder = await Sparkler.exists({ studentEmail: email, _id: { $ne: userId } });
  if (holder) throw new ConflictError("That email already verifies another account");
}

export async function sendStudentCode(userId: string, email: string): Promise<void> {
  await assertAddressIsFree(email, userId);

  const now = Date.now();
  const previous = await StudentEmailCode.findOne({ userId });
  if (previous && now - previous.sentAt.getTime() < RESEND_AFTER_MS) {
    throw new TooManyRequestsError("We just sent a code. Give it a minute before asking again.");
  }

  const code = newStudentCode();
  await StudentEmailCode.findOneAndUpdate(
    { userId },
    {
      userId,
      email,
      codeHash: hashOf(userId, code),
      attempts: 0,
      sentAt: new Date(now),
      expiresAt: new Date(now + CODE_LIFETIME_MS),
    },
    { upsert: true },
  );

  const { error } = await sendMail({
    to: email,
    subject: `${code} is your Sparkler student code`,
    heading: "Confirm you're a student",
    preheader: `Your code is ${code}`,
    message: `Your code is ${code}.\n\nIt works for 15 minutes. If you didn't ask for this, you can ignore it.`,
  });
  if (error) {
    await StudentEmailCode.deleteOne({ userId });
    throw new UpstreamError("Couldn't send that email. Please try again.");
  }
}

export async function confirmStudentCode(userId: string, code: string): Promise<void> {
  const pending = await StudentEmailCode.findOne({ userId });
  if (!pending || pending.expiresAt.getTime() < Date.now()) {
    throw new BadRequestError("That code has expired. Ask for a new one.");
  }
  if (pending.attempts >= MAX_ATTEMPTS) {
    await pending.deleteOne();
    throw new TooManyRequestsError("Too many tries. Ask for a new code.");
  }
  if (!sameHash(pending.codeHash, hashOf(userId, code))) {
    pending.attempts += 1;
    await pending.save();
    throw new BadRequestError("That code isn't right.");
  }

  await assertAddressIsFree(pending.email, userId);
  const updated = await Sparkler.findByIdAndUpdate(userId, {
    studentEmail: pending.email,
    studentVerifiedAt: new Date(),
  });
  if (!updated) throw new NotFoundError("User does not exist in the database");
  await pending.deleteOne();
}

export async function isStudentVerified(userId: string): Promise<boolean> {
  const user = await Sparkler.findById(userId, { studentVerifiedAt: 1 }).lean();
  return Boolean(user?.studentVerifiedAt);
}

export async function forgetStudentCode(userId: string): Promise<void> {
  await StudentEmailCode.deleteOne({ userId });
}
