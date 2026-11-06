import type { z } from "zod";

import { NotFoundError } from "../domain/errors.js";
import {
  RESOLVED_STATUSES,
  type IssueStatus,
  type issueChangeSchema,
  type issueNoteSchema,
  type newIssueSchema,
} from "../domain/issue.types.js";
import { nextInSequence } from "../models/counter.js";
import { Issue, type IIssue, type IssueDoc, type IssueTimelineEntry } from "../models/issue.js";
import { Sparkler } from "../models/sparkler.js";
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
    status: issue.status,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    resolution: issue.resolution
      ? { summary: issue.resolution.summary, resolvedAt: issue.resolution.resolvedAt }
      : null,
    timeline: issue.timeline
      .filter((entry) => entry.visibility === "reporter")
      .map(({ at, kind, from, to, body }) => ({ at, kind, from, to, body })),
  };
}

export function toStaffView(issue: IssueDoc) {
  const { _id, __v: _version, ...fields } = issue.toObject();
  return { id: _id.toString(), ...fields };
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
  issue: Pick<IIssue, "reference" | "type" | "title" | "description" | "reportedBy">,
): Promise<MailInput[]> {
  const admins = await Sparkler.find({ "custom.isAdmin": true }, { email: 1 }).lean();
  const who = issue.reportedBy.username ? `@${issue.reportedBy.username}` : issue.reportedBy.name;
  return admins.map(({ email }) => ({
    to: email,
    subject: `[${issue.reference}] ${issue.title}`,
    heading: `New ${issue.type} report`,
    preheader: `${who}: ${issue.title}`,
    message: [`${issue.title}\nFrom ${who}`, issue.description].join("\n\n"),
    cta: { label: "Open Sparkler", url: SITE },
  }));
}
