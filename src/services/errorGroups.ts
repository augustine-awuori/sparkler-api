import type { PipelineStage } from "mongoose";
import type { z } from "zod";

import { BadRequestError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import {
  RANGES,
  isObjectId,
  type ErrorEventInput,
  type ErrorGroupStatus,
  type RangeKey,
  type groupListQuerySchema,
} from "../domain/errorTracking.types.js";
import { Developer } from "../models/developer.js";
import { ErrorEvent, type ErrorEventDoc } from "../models/errorEvent.js";
import {
  ErrorGroup,
  USER_ID_CAP,
  VERSION_CAP,
  type ErrorGroupDoc,
  type ErrorTimelineEntry,
} from "../models/errorGroup.js";
import { refOf, type StaffMember } from "./developers.js";
import { compareVersions, fingerprintOf } from "./errorFingerprint.js";
import {
  assignedMail,
  assignmentAnsweredMail,
  resolvedMail,
  type MailPerson,
} from "./errorMail.js";
import type { MailInput } from "./mail.js";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** A device clock far ahead must not put an event in the future and break "last seen". */
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const TREND_DAYS = 14;

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function toGroupView(group: ErrorGroupDoc, trend?: number[]) {
  const { _id, __v: _version, userIds, ...fields } = group.toObject();
  return { id: _id.toString(), ...fields, userCount: userIds.length, ...(trend && { trend }) };
}

export function toEventView(event: ErrorEventDoc) {
  const { _id, ...fields } = event.toObject();
  return { id: _id.toString(), ...fields, groupId: fields.groupId.toString() };
}

// ── Ingest ────────────────────────────────────────────────────────────────

/**
 * A resolved error that comes back in a release newer than the one it was
 * fixed in wasn't fixed. One from an older build is someone who hasn't updated.
 */
function isRegression(group: ErrorGroupDoc, event: ErrorEventInput, occurredAt: Date): boolean {
  if (group.status !== "resolved") return false;
  if (group.resolvedInVersion && event.appVersion) {
    return compareVersions(event.appVersion, group.resolvedInVersion) > 0;
  }
  return occurredAt > (group.resolvedAt ?? new Date(0));
}

async function upsertGroup(fingerprint: string, event: ErrorEventInput, occurredAt: Date): Promise<ErrorGroupDoc> {
  const version = event.appVersion ?? "";
  const update = {
    $setOnInsert: {
      fingerprint,
      app: event.app,
      errorClass: event.errorClass,
      context: event.context ?? "",
      firstVersion: version,
      timeline: [{ at: occurredAt, by: null, kind: "created" }],
    },
    // The newest wording wins, so a message that improves in a release shows.
    $set: { message: event.message },
    $inc: { eventCount: 1 },
    $min: { firstSeen: occurredAt },
    $max: { lastSeen: occurredAt },
  };
  try {
    return await ErrorGroup.findOneAndUpdate({ fingerprint }, update, {
      upsert: true,
      returnDocument: "after",
      setDefaultsOnInsert: true,
    }).orFail();
  } catch (err) {
    // Two first occurrences raced on the unique index; the loser updates the winner's row.
    if ((err as { code?: number }).code !== 11000) throw err;
    return await ErrorGroup.findOneAndUpdate({ fingerprint }, update, { returnDocument: "after" }).orFail();
  }
}

/** The capped sets are separate updates, because Mongo can't cap `$addToSet` in one step. */
async function rememberUserAndVersion(group: ErrorGroupDoc, event: ErrorEventInput): Promise<void> {
  if (event.userId && !group.userIds.includes(event.userId) && group.userIds.length < USER_ID_CAP) {
    await ErrorGroup.updateOne(
      { _id: group._id, [`userIds.${USER_ID_CAP - 1}`]: { $exists: false } },
      { $addToSet: { userIds: event.userId } },
    );
  }
  const version = event.appVersion;
  if (!version) return;
  if (!group.versions.includes(version) && group.versions.length < VERSION_CAP) {
    await ErrorGroup.updateOne({ _id: group._id }, { $addToSet: { versions: version } });
  }
  if (!group.lastVersion || compareVersions(version, group.lastVersion) > 0) {
    await ErrorGroup.updateOne({ _id: group._id }, { $set: { lastVersion: version } });
  }
  if (!group.firstVersion) {
    await ErrorGroup.updateOne({ _id: group._id }, { $set: { firstVersion: version } });
  }
}

async function reopenIfRegressed(group: ErrorGroupDoc, event: ErrorEventInput, occurredAt: Date): Promise<void> {
  if (!isRegression(group, event, occurredAt)) return;
  // The resolution stays on the timeline; only "who fixed it" is cleared, since it isn't fixed.
  await ErrorGroup.updateOne(
    { _id: group._id, status: "resolved" },
    {
      $set: { status: "open", regressed: true, resolvedBy: null, resolvedAt: null },
      $push: {
        timeline: {
          at: new Date(),
          by: null,
          kind: "regressed",
          from: group.resolvedInVersion,
          to: event.appVersion ?? "",
        },
      },
    },
  );
}

export async function ingestEvent(event: ErrorEventInput, now = new Date()): Promise<void> {
  const occurredAt = new Date(Math.min((event.occurredAt ?? now).getTime(), now.getTime() + MAX_CLOCK_SKEW_MS));
  const fingerprint = fingerprintOf(event);
  const group = await upsertGroup(fingerprint, event, occurredAt);

  await ErrorEvent.create({ ...event, occurredAt, receivedAt: now, groupId: group._id });
  await rememberUserAndVersion(group, event);
  await reopenIfRegressed(group, event, occurredAt);
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function groupOr404(id: string): Promise<ErrorGroupDoc> {
  const group = isObjectId(id) ? await ErrorGroup.findById(id) : null;
  if (!group) throw new NotFoundError("That error doesn't exist");
  return group;
}

/** Daily event counts for each group over the last TREND_DAYS, oldest first. */
async function trendsFor(groupIds: readonly ErrorGroupDoc["_id"][], now: Date): Promise<Map<string, number[]>> {
  const start = new Date(now.getTime() - (TREND_DAYS - 1) * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  const rows = await ErrorEvent.aggregate<{ _id: { group: unknown; day: number }; count: number }>([
    { $match: { groupId: { $in: groupIds }, receivedAt: { $gte: start } } },
    {
      $group: {
        _id: { group: "$groupId", day: { $floor: { $divide: [{ $subtract: ["$receivedAt", start] }, DAY_MS] } } },
        count: { $sum: 1 },
      },
    },
  ]);
  const trends = new Map<string, number[]>();
  for (const id of groupIds) trends.set(String(id), Array(TREND_DAYS).fill(0) as number[]);
  for (const row of rows) {
    const series = trends.get(String(row._id.group));
    if (series && row._id.day >= 0 && row._id.day < TREND_DAYS) series[row._id.day] = row.count;
  }
  return trends;
}

const SORTS = {
  lastSeen: { lastSeen: -1 },
  firstSeen: { firstSeen: -1 },
  events: { eventCount: -1 },
  users: { userCount: -1 },
} as const;

export async function listGroups(
  query: z.infer<typeof groupListQuerySchema>,
  viewer: StaffMember,
  now = new Date(),
) {
  const { app, status, version, q, assignee, range, sort, page, limit } = query;
  const search = q ? new RegExp(escapeRegex(q), "i") : null;
  const filter = {
    ...(app && { app }),
    ...(status && { status }),
    ...(version && { versions: version }),
    ...(range && { lastSeen: { $gte: new Date(now.getTime() - RANGES[range] * HOUR_MS) } }),
    ...(assignee === "none" && { assignee: null }),
    ...(assignee === "me" && { "assignee.developerId": viewer.developerId }),
    ...(assignee && assignee !== "me" && assignee !== "none" && { "assignee.developerId": assignee }),
    ...(search && { $or: [{ message: search }, { errorClass: search }, { context: search }] }),
  };

  const pipeline: PipelineStage[] = [
    { $match: filter },
    { $addFields: { userCount: { $size: "$userIds" } } },
    { $sort: { ...SORTS[sort], _id: -1 } },
    { $skip: page * limit },
    { $limit: limit + 1 },
    { $project: { _id: 1 } },
  ];
  const [ids, total] = await Promise.all([
    ErrorGroup.aggregate<{ _id: ErrorGroupDoc["_id"] }>(pipeline),
    ErrorGroup.countDocuments(filter),
  ]);
  const pageIds = ids.slice(0, limit).map(({ _id }) => _id);
  const docs = await ErrorGroup.find({ _id: { $in: pageIds } });
  const byId = new Map(docs.map((doc) => [doc._id.toString(), doc]));
  const trends = await trendsFor(pageIds, now);

  return {
    groups: pageIds
      .map((id) => byId.get(id.toString()))
      .filter((doc): doc is ErrorGroupDoc => Boolean(doc))
      .map((doc) => toGroupView(doc, trends.get(doc._id.toString()))),
    total,
    hasMore: ids.length > limit,
  };
}

export async function listEvents(group: ErrorGroupDoc, cursor: string | undefined, limit: number) {
  const events = await ErrorEvent.find({ groupId: group._id, ...(cursor && { _id: { $lt: cursor } }) })
    .sort({ _id: -1 })
    .limit(limit + 1);
  const page = events.slice(0, limit);
  return {
    events: page.map(toEventView),
    nextCursor: events.length > limit ? (page[page.length - 1]?._id.toString() ?? null) : null,
  };
}

const BREAKDOWN_FIELDS = ["appVersion", "os", "osVersion", "device", "browser", "screen", "releaseStage", "platform"] as const;

/** What the occurrences have in common, so a fixer can see "only Android 14" at a glance. */
export async function groupBreakdown(group: ErrorGroupDoc, now = new Date()) {
  const facets = Object.fromEntries(
    BREAKDOWN_FIELDS.map((field) => [
      field,
      [
        { $group: { _id: { $ifNull: [`$${field}`, "unknown"] }, count: { $sum: 1 } } },
        { $sort: { count: -1 as const } },
        { $limit: 8 },
      ] satisfies PipelineStage.FacetPipelineStage[],
    ]),
  );
  const [result] = await ErrorEvent.aggregate<Record<string, { _id: string; count: number }[]>>([
    { $match: { groupId: group._id } },
    { $facet: facets },
  ]);
  const breakdown = Object.fromEntries(
    BREAKDOWN_FIELDS.map((field) => [
      field,
      (result?.[field] ?? []).map(({ _id, count }) => ({ key: String(_id), count })),
    ]),
  );

  const days = 30;
  const start = new Date(now.getTime() - (days - 1) * DAY_MS);
  start.setUTCHours(0, 0, 0, 0);
  const daily = await ErrorEvent.aggregate<{ _id: number; count: number }>([
    { $match: { groupId: group._id, receivedAt: { $gte: start } } },
    { $group: { _id: { $floor: { $divide: [{ $subtract: ["$receivedAt", start] }, DAY_MS] } }, count: { $sum: 1 } } },
  ]);
  const occurrences = Array.from({ length: days }, (_, day) => ({
    day: new Date(start.getTime() + day * DAY_MS),
    count: daily.find((row) => row._id === day)?.count ?? 0,
  }));

  return { breakdown, occurrences };
}

function bucketSize(range: RangeKey): number {
  return RANGES[range] <= 24 ? HOUR_MS : DAY_MS;
}

/** Everything the overview page draws, in one request. */
export async function errorStats(range: RangeKey, app: string | undefined, now = new Date()) {
  const hours = RANGES[range];
  const since = new Date(now.getTime() - hours * HOUR_MS);
  const size = bucketSize(range);
  const start = new Date(Math.floor(since.getTime() / size) * size);
  const eventMatch = { receivedAt: { $gte: start }, ...(app && { app }) };
  const groupMatch = app ? { app } : {};

  const [series, people, platforms, versions, openGroups, unassignedOpen, newGroups, regressed] =
    await Promise.all([
      ErrorEvent.aggregate<{ _id: { bucket: number; app: string }; count: number }>([
        { $match: eventMatch },
        {
          $group: {
            _id: { bucket: { $floor: { $divide: [{ $subtract: ["$receivedAt", start] }, size] } }, app: "$app" },
            count: { $sum: 1 },
          },
        },
      ]),
      ErrorEvent.distinct("userId", { ...eventMatch, userId: { $nin: [null, ""] } }),
      ErrorEvent.aggregate<{ _id: string; count: number }>([
        { $match: eventMatch },
        { $group: { _id: { $ifNull: ["$platform", "$app"] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      ErrorEvent.aggregate<{ _id: { app: string; version: string }; count: number }>([
        { $match: eventMatch },
        { $group: { _id: { app: "$app", version: { $ifNull: ["$appVersion", "unknown"] } }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      ErrorGroup.countDocuments({ ...groupMatch, status: "open" }),
      ErrorGroup.countDocuments({ ...groupMatch, status: "open", assignee: null }),
      ErrorGroup.countDocuments({ ...groupMatch, firstSeen: { $gte: since } }),
      ErrorGroup.countDocuments({ ...groupMatch, status: "open", regressed: true }),
    ]);

  const buckets = Math.ceil((now.getTime() - start.getTime()) / size);
  const timeline = Array.from({ length: buckets }, (_, index) => {
    const at = new Date(start.getTime() + index * size);
    const mobile = series.find((row) => row._id.bucket === index && row._id.app === "mobile")?.count ?? 0;
    const web = series.find((row) => row._id.bucket === index && row._id.app === "web")?.count ?? 0;
    return { at, mobile, web };
  });

  const topIds = await ErrorEvent.aggregate<{ _id: ErrorGroupDoc["_id"]; count: number }>([
    { $match: eventMatch },
    { $group: { _id: "$groupId", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 5 },
  ]);
  const topDocs = await ErrorGroup.find({ _id: { $in: topIds.map(({ _id }) => _id) } });
  const trends = await trendsFor(topIds.map(({ _id }) => _id), now);
  const topGroups = topIds
    .map(({ _id, count }) => {
      const doc = topDocs.find((candidate) => candidate._id.equals(_id));
      return doc ? { ...toGroupView(doc, trends.get(doc._id.toString())), eventsInRange: count } : null;
    })
    .filter(Boolean);

  return {
    range,
    bucket: size === HOUR_MS ? "hour" : "day",
    totals: {
      events: series.reduce((sum, row) => sum + row.count, 0),
      users: people.length,
      openGroups,
      unassignedOpen,
      newGroups,
      regressed,
    },
    timeline,
    platforms: platforms.map(({ _id, count }) => ({ key: String(_id), count })),
    versions: versions.map(({ _id, count }) => ({ app: _id.app, version: _id.version, count })),
    topGroups,
  };
}

// ── Team workflow ─────────────────────────────────────────────────────────

/** A developer works on what's theirs or nobody's; an admin on anything. */
function assertMayChange(group: ErrorGroupDoc, actor: StaffMember): void {
  if (actor.role === "admin") return;
  if (!group.assignee || group.assignee.developerId === actor.developerId) return;
  throw new ForbiddenError(`This error is assigned to ${group.assignee.name}`);
}

function record(group: ErrorGroupDoc, actor: StaffMember | null, entry: Omit<ErrorTimelineEntry, "at" | "by">) {
  group.timeline.push({ at: new Date(), by: actor ? refOf(actor) : null, ...entry });
}

async function mailPerson(developerId: string): Promise<MailPerson | null> {
  const developer = await Developer.findById(developerId, { name: 1, email: 1 });
  return developer?.email ? { name: developer.name || "A teammate", email: developer.email } : null;
}

export interface WorkflowResult {
  group: ErrorGroupDoc;
  mails: MailInput[];
}

function markResolved(group: ErrorGroupDoc, actor: StaffMember, note?: string): void {
  record(group, actor, { kind: "resolved", from: group.status, to: "resolved", ...(note && { body: note }) });
  group.status = "resolved";
  group.regressed = false;
  group.resolvedBy = refOf(actor);
  group.resolvedAt = new Date();
  group.resolvedInVersion = group.lastVersion;
  group.resolutionNote = note ?? "";
}

/** Tells whoever handed the work out, unless they did it themselves. */
async function mailAssigner(group: ErrorGroupDoc, actor: StaffMember, build: (assigner: MailPerson) => MailInput) {
  const assignerId = group.assignee?.assignedBy.developerId;
  if (!assignerId || assignerId === actor.developerId) return [];
  const assigner = await mailPerson(assignerId);
  return assigner ? [build(assigner)] : [];
}

export async function setGroupStatus(
  group: ErrorGroupDoc,
  actor: StaffMember,
  status: ErrorGroupStatus,
  note?: string,
): Promise<WorkflowResult> {
  assertMayChange(group, actor);
  if (status === group.status) return { group, mails: [] };
  if (status === "resolved") return await resolveGroup(group, actor, note);

  record(group, actor, { kind: "status", from: group.status, to: status, ...(note && { body: note }) });
  group.status = status;
  if (status === "open") group.regressed = false;
  group.resolvedBy = null;
  group.resolvedAt = null;
  return { group: await group.save(), mails: [] };
}

export async function resolveGroup(group: ErrorGroupDoc, actor: StaffMember, note?: string): Promise<WorkflowResult> {
  assertMayChange(group, actor);
  if (group.status === "resolved") throw new BadRequestError("It's already resolved");
  markResolved(group, actor, note);
  const mails = await mailAssigner(group, actor, (assigner) =>
    resolvedMail(group, assigner, { name: actor.name, email: actor.email }, note),
  );
  return { group: await group.save(), mails };
}

export async function assignGroup(group: ErrorGroupDoc, actor: StaffMember, developerId: string): Promise<WorkflowResult> {
  assertMayChange(group, actor);
  const developer = await Developer.findOne({ _id: developerId, status: "active" });
  if (!developer) throw new NotFoundError("That developer isn't on the team");
  if (group.assignee?.developerId === developerId) return { group, mails: [] };

  const selfAssigned = developerId === actor.developerId;
  const now = new Date();
  record(group, actor, { kind: "assigned", ...(group.assignee && { from: group.assignee.developerId }), to: developerId });
  group.assignee = {
    developerId,
    name: developer.name,
    assignedBy: refOf(actor),
    assignedAt: now,
    // Taking it yourself is accepting it; there's nobody to ask.
    state: selfAssigned ? "accepted" : "pending",
    respondedAt: selfAssigned ? now : null,
  };
  const saved = await group.save();
  const mails = selfAssigned
    ? []
    : [assignedMail(saved, { name: developer.name, email: developer.email }, { name: actor.name, email: actor.email })];
  return { group: saved, mails };
}

export async function unassignGroup(group: ErrorGroupDoc, actor: StaffMember): Promise<WorkflowResult> {
  assertMayChange(group, actor);
  if (!group.assignee) return { group, mails: [] };
  record(group, actor, { kind: "unassigned", from: group.assignee.developerId });
  group.assignee = null;
  return { group: await group.save(), mails: [] };
}

function assertPendingFor(group: ErrorGroupDoc, actor: StaffMember) {
  if (group.assignee?.developerId !== actor.developerId) {
    throw new ForbiddenError("Only the person it's assigned to can answer");
  }
  if (group.assignee.state !== "pending") throw new BadRequestError("You've already answered");
  return group.assignee;
}

export async function acceptAssignment(group: ErrorGroupDoc, actor: StaffMember): Promise<WorkflowResult> {
  const assignment = assertPendingFor(group, actor);
  assignment.state = "accepted";
  assignment.respondedAt = new Date();
  record(group, actor, { kind: "accepted" });
  const mails = await mailAssigner(group, actor, (assigner) =>
    assignmentAnsweredMail(group, assigner, { name: actor.name, email: actor.email }, { accepted: true }),
  );
  return { group: await group.save(), mails };
}

export async function rejectAssignment(group: ErrorGroupDoc, actor: StaffMember, reason?: string): Promise<WorkflowResult> {
  assertPendingFor(group, actor);
  // Built before the assignee is cleared, since the mail goes to whoever assigned it.
  const mails = await mailAssigner(group, actor, (assigner) =>
    assignmentAnsweredMail(group, assigner, { name: actor.name, email: actor.email }, { accepted: false, reason }),
  );
  record(group, actor, { kind: "rejected", ...(reason && { body: reason }) });
  group.assignee = null;
  return { group: await group.save(), mails };
}

export async function commentOnGroup(group: ErrorGroupDoc, actor: StaffMember, body: string): Promise<ErrorGroupDoc> {
  record(group, actor, { kind: "comment", body });
  return await group.save();
}
