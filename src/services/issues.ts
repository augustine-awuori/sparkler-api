import type { z } from "zod";

import { NotFoundError } from "../domain/errors.js";
import {
  ISSUE_STATUSES,
  RESOLVED_STATUSES,
  type IssueStatus,
  type issueChangeSchema,
  type issueListQuerySchema,
  type issueNoteSchema,
  type newIssueSchema,
} from "../domain/issue.types.js";
import { ISSUE_RESOLVED_ACTION, ISSUE_RESOLVED_POINTS } from "../domain/points.js";
import { nextInSequence } from "../models/counter.js";
import { Issue, type IIssue, type IssueDoc, type IssueTimelineEntry } from "../models/issue.js";
import { PointEvent } from "../models/pointEvent.js";
import { Sparkler } from "../models/sparkler.js";
import { isDuplicateKey } from "../utils/isDuplicateKey.js";
import type { PushPayload } from "../utils/pushNotifications.js";
import { findSparklerById } from "./users.js";
import type { MailInput } from "./mail.js";

/** Numbers start high enough that a reference looks like a reference, not a count. */
const FIRST_REFERENCE = 1000;
const MAX_ISSUES_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

const SITE = "https://sparkler.website/";

/** What the person who reported an issue may see: no notes, handler or triage. */
export function toReporterView(issue: IssueDoc) {
  return {
    id: issue._id.toString(),
    reference: issue.reference,
    type: issue.type,
    title: issue.title,
    description: issue.description,
    attachments: issue.attachments.map(({ url, kind }) => ({ url, kind })),
    status: issue.status,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    resolution: issue.resolution
      ? { summary: issue.resolution.summary, resolvedAt: issue.resolution.resolvedAt }
      : null,
    reward: issue.reward
      ? { points: issue.reward.points, awardedAt: issue.reward.awardedAt }
      : null,
    timeline: issue.timeline
      .filter((entry) => entry.visibility === "reporter")
      .map(({ at, kind, from, to, body }) => ({ at, kind, from, to, body })),
  };
}

export function toStaffView(issue: IssueDoc) {
  const { _id, __v: _version, ...fields } = issue.toObject();
  return { id: _id.toString(), ...fields, reward: fields.reward ?? null };
}

/**
 * One issue for the team, with what the dashboard shows beside the report: the
 * reporter's photo, how often they write in, and whether resolving it can pay.
 */
export async function toStaffDetail(issue: IssueDoc) {
  const { userId } = issue.reportedBy;
  const [reporter, totalReports] = await Promise.all([
    findSparklerById(userId),
    Issue.countDocuments({ "reportedBy.userId": userId }),
  ]);
  return {
    ...toStaffView(issue),
    reporter: {
      image: reporter?.image ?? "",
      isAdmin: reporter?.custom?.isAdmin === true,
      exists: Boolean(reporter),
      totalReports,
    },
  };
}

/** How many issues sit in each status, and how many live ones nobody has taken. */
export async function issueSummary() {
  const [rows, unhandled] = await Promise.all([
    Issue.aggregate<{ _id: IssueStatus; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Issue.countDocuments({ status: { $nin: RESOLVED_STATUSES }, handledBy: null }),
  ]);
  const byStatus = Object.fromEntries(
    ISSUE_STATUSES.map((status) => [status, rows.find((row) => row._id === status)?.count ?? 0]),
  ) as Record<IssueStatus, number>;
  return { byStatus, unhandled, total: rows.reduce((sum, row) => sum + row.count, 0) };
}

const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The Mongo filter for the team's list. `q` is matched as text, never as a pattern. */
export function issueListFilter({
  status,
  priority,
  type,
  source,
  handledBy,
  q,
  cursor,
}: Omit<z.infer<typeof issueListQuerySchema>, "limit">) {
  const text = q ? new RegExp(escapeRegex(q), "i") : null;
  return {
    ...(status && { status }),
    ...(priority && { priority }),
    ...(type && { type }),
    ...(source && { source }),
    ...(handledBy === "none" && { handledBy: null }),
    ...(handledBy && handledBy !== "none" && { "handledBy.userId": handledBy }),
    ...(text && { $or: [{ title: text }, { description: text }, { reference: text }] }),
    ...(cursor && { _id: { $lt: cursor } }),
  };
}

export async function isReportLimitReached(userId: string): Promise<boolean> {
  const recent = await Issue.countDocuments({
    "reportedBy.userId": userId,
    createdAt: { $gte: new Date(Date.now() - HOUR_MS) },
  });
  return recent >= MAX_ISSUES_PER_HOUR;
}

export async function createIssue(
  userId: string,
  fields: z.infer<typeof newIssueSchema>,
): Promise<IssueDoc> {
  const reporter = await findSparklerById(userId);
  if (!reporter) throw new NotFoundError("User does not exist in the database");

  const number = await nextInSequence("issue");
  return await Issue.create({
    ...fields,
    reference: `SPK-${FIRST_REFERENCE + number}`,
    reportedBy: {
      userId,
      name: reporter.name ?? "",
      username: reporter.custom?.username ?? "",
    },
    timeline: [{ at: new Date(), actorId: userId, kind: "created", visibility: "reporter" }],
  });
}

function resolutionFor(status: IssueStatus, summary: string, actorId: string, at: Date) {
  return RESOLVED_STATUSES.includes(status) ? { summary, resolvedBy: actorId, resolvedAt: at } : null;
}

/**
 * Thanks the reporter with points, once per issue however often it's reopened:
 * the ledger's unique index is what refuses a second payment. Admins earn
 * nothing for reports, and nor does anyone resolving their own.
 */
async function rewardReporter(issue: IssueDoc, actorId: string, at: Date): Promise<void> {
  const reporterId = issue.reportedBy.userId;
  if (reporterId === actorId) return;
  const reporter = await findSparklerById(reporterId);
  if (!reporter || reporter.custom?.isAdmin) return;

  try {
    await PointEvent.create({
      userId: reporterId,
      action: ISSUE_RESOLVED_ACTION,
      targetId: issue._id.toString(),
      points: ISSUE_RESOLVED_POINTS,
    });
  } catch (error) {
    if (isDuplicateKey(error)) return;
    throw error;
  }
  await Sparkler.updateOne({ _id: reporterId }, { $inc: { points: ISSUE_RESOLVED_POINTS } });
  issue.reward = { points: ISSUE_RESOLVED_POINTS, awardedAt: at };
}

/**
 * Staff changes, each recorded on the timeline. A reporter sees status changes
 * and resolution notes, but not assignment or priority, which are about how the
 * team works.
 */
export async function applyIssueChange(
  issue: IssueDoc,
  actorId: string,
  change: z.infer<typeof issueChangeSchema>,
): Promise<IssueDoc> {
  const now = new Date();
  const record = (entry: Omit<IssueTimelineEntry, "at" | "actorId">) =>
    issue.timeline.push({ at: now, actorId, ...entry });

  const { status, priority, handledBy, resolutionSummary } = change;

  if (status && status !== issue.status) {
    record({ kind: "status_changed", visibility: "reporter", from: issue.status, to: status });
    issue.status = status;
    issue.resolution = resolutionFor(status, resolutionSummary ?? "", actorId, now);
    if (status === "resolved") await rewardReporter(issue, actorId, now);
  } else if (resolutionSummary !== undefined && issue.resolution) {
    issue.resolution.summary = resolutionSummary;
    record({ kind: "note", visibility: "reporter", body: resolutionSummary });
  }

  if (priority && priority !== issue.priority) {
    record({ kind: "priority_changed", visibility: "internal", from: issue.priority, to: priority });
    issue.priority = priority;
  }

  const currentHandler = issue.handledBy?.userId;
  if (handledBy === null && currentHandler) {
    record({ kind: "assigned", visibility: "internal", from: currentHandler });
    issue.handledBy = null;
  } else if (handledBy && handledBy !== currentHandler) {
    const handler = await findSparklerById(handledBy);
    if (!handler) throw new NotFoundError("That person doesn't exist");
    record({ kind: "assigned", visibility: "internal", from: currentHandler, to: handledBy });
    issue.handledBy = { userId: handledBy, name: handler.name ?? "", assignedAt: now };
  }

  return await issue.save();
}

export async function addIssueNote(
  issue: IssueDoc,
  actorId: string,
  { body, visibility }: z.infer<typeof issueNoteSchema>,
): Promise<IssueDoc> {
  issue.timeline.push({
    at: new Date(),
    actorId,
    kind: visibility === "reporter" ? "reply" : "note",
    body,
    visibility,
  });
  return await issue.save();
}

/** The reporter's words stay readable after they leave, without saying who they were. */
export async function scrubIssueReporter(userId: string): Promise<void> {
  await Issue.updateMany(
    { "reportedBy.userId": userId },
    { $set: { "reportedBy.name": "Deleted account", "reportedBy.username": "" } },
  );
}

/**
 * Until the IT team's app exists, this is how a report reaches anyone. The text
 * is the reporter's own, and the mail template escapes it.
 */
export async function issueReportedMails(
  issue: Pick<IIssue, "reference" | "type" | "title" | "description" | "reportedBy" | "attachments">,
): Promise<MailInput[]> {
  const admins = await Sparkler.find({ "custom.isAdmin": true }, { email: 1 }).lean();
  const who = issue.reportedBy.username ? `@${issue.reportedBy.username}` : issue.reportedBy.name;
  return admins.map(({ email }) => ({
    to: email,
    subject: `[${issue.reference}] ${issue.title}`,
    heading: `New ${issue.type} report`,
    preheader: `${who}: ${issue.title}`,
    message: [
      `${issue.title}\nFrom ${who}`,
      issue.description,
      ...issue.attachments.map(({ url }) => `Screenshot: ${url}`),
    ].join("\n\n"),
    cta: { label: "Open Sparkler", url: SITE },
  }));
}

const STATUS_WORDS: Record<IssueStatus, string> = {
  open: "We've reopened it.",
  triaged: "We're looking at it.",
  in_progress: "We're working on it.",
  waiting_on_user: "We need something from you. Please check the reply below or message the team.",
  resolved: "It's resolved.",
  closed: "We've closed it.",
};

const isResolving = (entry: IssueTimelineEntry): boolean =>
  entry.kind === "status_changed" && entry.to === "resolved";

/** The points this change earned, or 0: a second resolve of a paid issue earns nothing new. */
function pointsJustEarned(issue: IssueDoc, newEntries: readonly IssueTimelineEntry[]): number {
  const awardedAt = issue.reward?.awardedAt.getTime();
  const earnedNow = newEntries.some(
    (entry) => isResolving(entry) && new Date(entry.at).getTime() === awardedAt,
  );
  return earnedNow ? (issue.reward?.points ?? 0) : 0;
}

function thanksFor(points: number): string {
  return points
    ? `It's resolved. Thank you for telling us: you've earned ${points} points for helping make Sparkler better.`
    : "It's resolved. Thank you for telling us. It helped make Sparkler better.";
}

function describeForReporter(entry: IssueTimelineEntry, issue: IssueDoc, points: number): string | null {
  if (entry.visibility !== "reporter") return null;
  if (isResolving(entry)) {
    const fix = issue.resolution?.summary;
    return fix ? `${thanksFor(points)}\n\nWhat we did: ${fix}` : thanksFor(points);
  }
  if (entry.kind === "status_changed") return STATUS_WORDS[entry.to as IssueStatus] ?? null;
  return entry.body ?? null;
}

/**
 * The congratulation for the reporter's phone when their report is resolved,
 * or null for any other change. `kind` is what the app routes the tap by.
 */
export function reporterResolvedPush(
  issue: IssueDoc,
  newEntries: readonly IssueTimelineEntry[],
): PushPayload | null {
  if (!newEntries.some(isResolving)) return null;
  const points = pointsJustEarned(issue, newEntries);
  return {
    title: "Your report is resolved \u{1F389}",
    message: points
      ? `Thank you! "${issue.title}" is fixed, and you've earned ${points} points.`
      : `Thank you! "${issue.title}" is fixed.`,
    data: { kind: "issue_resolved", type: "issue_resolved", id: issue._id.toString() },
  };
}

/**
 * Tells the reporter what changed, if anything they're allowed to see did.
 * Takes the new timeline entries, so a note or assignment can never reach them.
 */
export async function reporterUpdateMail(
  issue: IssueDoc,
  newEntries: readonly IssueTimelineEntry[],
): Promise<MailInput[]> {
  const points = pointsJustEarned(issue, newEntries);
  const lines = newEntries
    .map((entry) => describeForReporter(entry, issue, points))
    .filter((line): line is string => Boolean(line));
  if (!lines.length) return [];
  const resolved = newEntries.some(isResolving);
  const heading = resolved ? "Your report is fixed. Thank you!" : "An update on your report";
  const reporter = await findSparklerById(issue.reportedBy.userId);
  if (!reporter) return [];
  return [
    {
      to: reporter.email,
      subject: `[${issue.reference}] ${heading}`,
      heading,
      preheader: issue.title,
      message: [issue.title, ...lines].join("\n\n"),
      cta: { label: "Open Sparkler", url: SITE },
    },
  ];
}
