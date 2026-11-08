import { z } from "zod";

/**
 * Errors the apps hit while people use them: crashes and caught failures that
 * nobody reported. Separate from `/api/issues`, which holds what users chose to
 * tell us.
 */

export const ERROR_APPS = ["mobile", "web"] as const;
export const ERROR_SEVERITIES = ["error", "warning", "info"] as const;
export const ERROR_GROUP_STATUSES = ["open", "resolved", "ignored"] as const;
export const BREADCRUMB_TYPES = ["navigation", "log", "state", "request", "user", "error"] as const;
export const ASSIGNMENT_STATES = ["pending", "accepted"] as const;
export const DEVELOPER_ROLES = ["admin", "developer"] as const;
export const DEVELOPER_STATUSES = ["pending", "active", "removed"] as const;
export const ERROR_TIMELINE_KINDS = [
  "created",
  "assigned",
  "accepted",
  "rejected",
  "unassigned",
  "status",
  "resolved",
  "regressed",
  "comment",
] as const;

export type ErrorApp = (typeof ERROR_APPS)[number];
export type ErrorGroupStatus = (typeof ERROR_GROUP_STATUSES)[number];
export type AssignmentState = (typeof ASSIGNMENT_STATES)[number];
export type DeveloperRole = (typeof DEVELOPER_ROLES)[number];
export type DeveloperStatus = (typeof DEVELOPER_STATUSES)[number];
export type ErrorTimelineKind = (typeof ERROR_TIMELINE_KINDS)[number];

/** Express's JSON limit is 100 KB; these keep a batch of events under it. */
export const MAX_STACK_CHARS = 8_000;
export const MAX_DETAILS_BYTES = 4_000;
export const MAX_BREADCRUMBS = 30;
export const MAX_EVENTS_PER_BATCH = 10;

const OBJECT_ID = /^[a-f\d]{24}$/i;
const shortText = z.string().trim().max(120).optional();

function jsonSize(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "", "utf8");
}

const details = z
  .record(z.string(), z.unknown())
  .refine((value) => jsonSize(value) <= MAX_DETAILS_BYTES, {
    message: `details must be under ${MAX_DETAILS_BYTES} bytes`,
  });

const breadcrumb = z.object({
  at: z.coerce.date(),
  type: z.enum(BREADCRUMB_TYPES),
  message: z.string().max(300),
  data: details.optional(),
});

/** Never trusted for identity: a valid token's user id replaces `userId`. */
export const errorEventSchema = z.object({
  app: z.enum(ERROR_APPS),
  errorClass: z.string().trim().max(200).default("Error"),
  message: z.string().max(2_000).default(""),
  stack: z.string().max(MAX_STACK_CHARS).optional(),
  /** The caller's stable label, such as "[Stream] Could not follow". */
  context: z.string().trim().max(200).optional(),
  details: details.optional(),
  severity: z.enum(ERROR_SEVERITIES).default("error"),
  handled: z.boolean().default(true),
  /** When it happened on the device. Queued crashes arrive a launch later. */
  occurredAt: z.coerce.date().optional(),
  appVersion: shortText,
  buildNumber: shortText,
  releaseStage: shortText,
  platform: shortText,
  os: shortText,
  osVersion: shortText,
  device: shortText,
  browser: shortText,
  screen: shortText,
  userId: z.string().trim().max(64).optional(),
  sessionId: shortText,
  locale: shortText,
  timezone: shortText,
  online: z.boolean().optional(),
  breadcrumbs: z.array(breadcrumb).max(MAX_BREADCRUMBS).default([]),
});

export type ErrorEventInput = z.infer<typeof errorEventSchema>;

export const errorIngestSchema = z.union([
  z.object({ events: z.array(errorEventSchema).min(1).max(MAX_EVENTS_PER_BATCH) }),
  errorEventSchema.transform((event) => ({ events: [event] })),
]);

const objectId = z.string().regex(OBJECT_ID);

export const RANGES = { "24h": 24, "7d": 24 * 7, "14d": 24 * 14, "30d": 24 * 30, "90d": 24 * 90 } as const;
export type RangeKey = keyof typeof RANGES;

export const groupListQuerySchema = z.object({
  app: z.enum(ERROR_APPS).optional(),
  status: z.enum(ERROR_GROUP_STATUSES).optional(),
  version: shortText,
  q: z.string().trim().max(120).optional(),
  assignee: z.union([z.literal("me"), z.literal("none"), objectId]).optional(),
  range: z.enum(Object.keys(RANGES) as [RangeKey, ...RangeKey[]]).optional(),
  sort: z.enum(["lastSeen", "firstSeen", "events", "users"]).default("lastSeen"),
  page: z.coerce.number().int().min(0).max(1000).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const eventListQuerySchema = z.object({
  cursor: objectId.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const statsQuerySchema = z.object({
  app: z.enum(ERROR_APPS).optional(),
  range: z.enum(Object.keys(RANGES) as [RangeKey, ...RangeKey[]]).default("7d"),
});

export const groupStatusChangeSchema = z.object({
  status: z.enum(ERROR_GROUP_STATUSES),
  note: z.string().trim().max(2_000).optional(),
});

export const bulkStatusSchema = groupStatusChangeSchema.extend({
  ids: z.array(objectId).min(1).max(100),
});

export const assignSchema = z.object({ developerId: objectId });
export const rejectSchema = z.object({ reason: z.string().trim().max(1_000).optional() });
export const resolveSchema = z.object({ note: z.string().trim().max(2_000).optional() });
export const commentSchema = z.object({ body: z.string().trim().min(1).max(4_000) });

export const developerChangeSchema = z
  .object({
    status: z.enum(DEVELOPER_STATUSES).optional(),
    role: z.enum(DEVELOPER_ROLES).optional(),
  })
  .refine((change) => change.status !== undefined || change.role !== undefined, {
    message: "Nothing to change",
  });

export const developerListQuerySchema = z.object({
  status: z.enum(DEVELOPER_STATUSES).optional(),
});

export function isObjectId(value: string): boolean {
  return OBJECT_ID.test(value);
}
