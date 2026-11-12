import { z } from "zod";

export const ISSUE_TYPES = ["bug", "account", "content", "feedback", "other"] as const;
export const ISSUE_STATUSES = [
  "open",
  "triaged",
  "in_progress",
  "waiting_on_user",
  "resolved",
  "closed",
] as const;
export const ISSUE_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const ISSUE_SOURCES = ["mobile", "web"] as const;
export const TIMELINE_KINDS = [
  "created",
  "status_changed",
  "assigned",
  "priority_changed",
  "note",
  "reply",
] as const;
/** `internal` is for whoever handles issues. A reporter only ever sees `reporter`. */
export const TIMELINE_VISIBILITIES = ["internal", "reporter"] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export type IssuePriority = (typeof ISSUE_PRIORITIES)[number];
export type IssueTimelineKind = (typeof TIMELINE_KINDS)[number];
export type IssueTimelineVisibility = (typeof TIMELINE_VISIBILITIES)[number];

const OBJECT_ID = /^[a-f\d]{24}$/i;
const shortText = z.string().trim().max(120).optional();

export const MAX_ISSUE_ATTACHMENTS = 3;

/** Only our own storage, so a report can't make staff open a link of the sender's choosing. */
const ownStorageUrl = z
  .string()
  .url()
  .max(2000)
  .refine((url) => url.startsWith("https://firebasestorage.googleapis.com/"), {
    message: "Attachments must be uploaded to Sparkler",
  });

/** Sent by the client and never trusted for identity: `reportedBy` comes from the token. */
export const newIssueSchema = z.object({
  type: z.enum(ISSUE_TYPES),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(1).max(4000),
  source: z.enum(ISSUE_SOURCES),
  attachments: z
    .array(z.object({ url: ownStorageUrl, kind: z.literal("image") }))
    .max(MAX_ISSUE_ATTACHMENTS)
    .default([]),
  context: z
    .object({
      platform: shortText,
      appVersion: shortText,
      os: shortText,
      device: shortText,
      screen: shortText,
      locale: shortText,
      timezone: shortText,
    })
    .default({}),
});

export const issueListQuerySchema = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  priority: z.enum(ISSUE_PRIORITIES).optional(),
  type: z.enum(ISSUE_TYPES).optional(),
  source: z.enum(ISSUE_SOURCES).optional(),
  handledBy: z.union([z.literal("none"), z.string().regex(OBJECT_ID)]).optional(),
  /** Matched as plain text against the title, description and reference. */
  q: z.string().trim().min(1).max(100).optional(),
  cursor: z.string().regex(OBJECT_ID).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const issueChangeSchema = z
  .object({
    status: z.enum(ISSUE_STATUSES).optional(),
    priority: z.enum(ISSUE_PRIORITIES).optional(),
    /** `null` takes the issue off whoever had it. */
    handledBy: z.string().regex(OBJECT_ID).nullable().optional(),
    resolutionSummary: z.string().trim().max(2000).optional(),
  })
  .refine((change) => Object.values(change).some((value) => value !== undefined), {
    message: "Nothing to change",
  });

export const issueNoteSchema = z.object({
  body: z.string().trim().min(1).max(4000),
  visibility: z.enum(TIMELINE_VISIBILITIES),
});

export const RESOLVED_STATUSES: readonly IssueStatus[] = ["resolved", "closed"];

export function isIssueId(value: string): boolean {
  return OBJECT_ID.test(value);
}
