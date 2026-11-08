import type { z } from "zod";

import { BadRequestError, NotFoundError } from "../domain/errors.js";
import type { DeveloperRole, developerChangeSchema } from "../domain/errorTracking.types.js";
import { Developer, type DeveloperDoc } from "../models/developer.js";
import { ErrorGroup, type DeveloperRef } from "../models/errorGroup.js";
import type { SparklerDoc } from "../models/sparkler.js";
import { findSparklerById } from "./users.js";

/** Who is acting, as the routes behind `requireIssueStaff` see them. */
export interface StaffMember {
  developerId: string;
  sparklerId: string;
  name: string;
  email: string;
  role: DeveloperRole;
}

export function toDeveloperView(developer: DeveloperDoc) {
  return {
    id: developer._id.toString(),
    sparklerId: developer.sparklerId,
    name: developer.name,
    email: developer.email,
    photo: developer.photo,
    role: developer.role,
    status: developer.status,
    requestedAt: developer.requestedAt,
    approvedAt: developer.approvedAt,
  };
}

export function refOf(staff: Pick<StaffMember, "developerId" | "name">): DeveloperRef {
  return { developerId: staff.developerId, name: staff.name };
}

function toStaff(developer: DeveloperDoc): StaffMember {
  return {
    developerId: developer._id.toString(),
    sparklerId: developer.sparklerId,
    name: developer.name,
    email: developer.email,
    role: developer.role,
  };
}

/**
 * A Sparkler admin is always an active admin developer, so the people who ran
 * issues before the team app existed keep their access without registering.
 */
async function adminDeveloper(sparkler: SparklerDoc): Promise<DeveloperDoc> {
  const now = new Date();
  return await Developer.findOneAndUpdate(
    { sparklerId: sparkler._id.toString() },
    {
      $set: {
        role: "admin",
        status: "active",
        name: sparkler.name ?? "",
        email: sparkler.email,
        photo: sparkler.image ?? "",
      },
      $setOnInsert: { requestedAt: now, approvedAt: now, approvedBy: null },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  ).orFail();
}

/** Null for anyone who isn't an active member of the team. Read fresh every time, so removal is immediate. */
export async function staffFor(sparklerId: string): Promise<StaffMember | null> {
  const sparkler = await findSparklerById(sparklerId);
  if (!sparkler) return null;
  if (sparkler.custom?.isAdmin) return toStaff(await adminDeveloper(sparkler));

  const developer = await Developer.findOne({ sparklerId, status: "active" });
  return developer ? toStaff(developer) : null;
}

export async function developerFor(sparklerId: string): Promise<DeveloperDoc | null> {
  const sparkler = await findSparklerById(sparklerId);
  if (sparkler?.custom?.isAdmin) return await adminDeveloper(sparkler);
  return await Developer.findOne({ sparklerId });
}

/** Asking twice changes nothing; someone removed may ask again. */
export async function registerDeveloper(
  sparklerId: string,
): Promise<{ developer: DeveloperDoc; isNewRequest: boolean }> {
  const sparkler = await findSparklerById(sparklerId);
  if (!sparkler) throw new NotFoundError("User does not exist in the database");
  if (sparkler.custom?.isAdmin) return { developer: await adminDeveloper(sparkler), isNewRequest: false };

  const existing = await Developer.findOne({ sparklerId });
  if (existing && existing.status !== "removed") return { developer: existing, isNewRequest: false };

  const profile = { name: sparkler.name ?? "", email: sparkler.email, photo: sparkler.image ?? "" };
  if (existing) {
    Object.assign(existing, profile, { status: "pending", requestedAt: new Date(), approvedBy: null, approvedAt: null });
    return { developer: await existing.save(), isNewRequest: true };
  }
  const developer = await Developer.create({ sparklerId, ...profile, requestedAt: new Date() });
  return { developer, isNewRequest: true };
}

export async function developerOr404(id: string): Promise<DeveloperDoc> {
  const developer = await Developer.findById(id);
  if (!developer) throw new NotFoundError("That developer doesn't exist");
  return developer;
}

/** Returns whether the change approved someone, so the caller can tell them. */
export async function changeDeveloper(
  developer: DeveloperDoc,
  actor: StaffMember,
  { status, role }: z.infer<typeof developerChangeSchema>,
): Promise<{ developer: DeveloperDoc; approved: boolean }> {
  // Stops the last admin locking everyone out by demoting or removing themselves.
  if (developer._id.toString() === actor.developerId) {
    throw new BadRequestError("You can't change your own access");
  }

  const approved = status === "active" && developer.status !== "active";
  if (status) developer.status = status;
  if (role) developer.role = role;
  if (approved) {
    developer.approvedBy = actor.developerId;
    developer.approvedAt = new Date();
  }
  return { developer: await developer.save(), approved };
}

/**
 * On account deletion. The record stays, as "Deleted account", so timelines
 * still say a teammate fixed something, but their email and access go.
 */
export async function forgetDeveloper(sparklerId: string): Promise<void> {
  await Developer.updateOne(
    { sparklerId },
    { $set: { status: "removed", name: "Deleted account", email: "", photo: "" } },
  );
}

export async function staffAdmins(): Promise<DeveloperDoc[]> {
  return await Developer.find({ role: "admin", status: "active" });
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const WEEKS_CHARTED = 8;

/** Who fixed what: per developer, what's on their plate, what they resolved and how fast. */
export async function developerStats(now = new Date()) {
  const developers = await Developer.find({ status: "active" }).sort({ name: 1 });
  const ids = developers.map((developer) => developer._id.toString());

  const open = await ErrorGroup.aggregate<{ _id: string; open: number; pending: number }>([
    { $match: { "assignee.developerId": { $in: ids }, status: "open" } },
    {
      $group: {
        _id: "$assignee.developerId",
        open: { $sum: 1 },
        pending: { $sum: { $cond: [{ $eq: ["$assignee.state", "pending"] }, 1, 0] } },
      },
    },
  ]);
  const resolved = await ErrorGroup.find(
    { "resolvedBy.developerId": { $in: ids }, resolvedAt: { $ne: null } },
    { resolvedBy: 1, resolvedAt: 1, firstSeen: 1, timeline: 1 },
  ).lean();

  const since = now.getTime() - WEEKS_CHARTED * WEEK_MS;
  return developers.map((developer) => {
    const id = developer._id.toString();
    const mine = resolved.filter((group) => group.resolvedBy?.developerId === id);
    const hoursToResolve = mine.map((group) => {
      const taken = [...group.timeline]
        .reverse()
        .find((entry) => entry.kind === "assigned" && entry.to === id && entry.at <= (group.resolvedAt as Date));
      const start = (taken?.at ?? group.firstSeen).getTime();
      return ((group.resolvedAt as Date).getTime() - start) / 3_600_000;
    });
    const weekly = Array.from({ length: WEEKS_CHARTED }, (_, week) => {
      const from = since + week * WEEK_MS;
      return {
        weekStart: new Date(from),
        resolved: mine.filter((group) => {
          const at = (group.resolvedAt as Date).getTime();
          return at >= from && at < from + WEEK_MS;
        }).length,
      };
    });
    const load = open.find((row) => row._id === id);
    return {
      developer: toDeveloperView(developer),
      open: load?.open ?? 0,
      pending: load?.pending ?? 0,
      resolved: mine.length,
      medianHoursToResolve: median(hoursToResolve),
      weekly,
    };
  });
}
