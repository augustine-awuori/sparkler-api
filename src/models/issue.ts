import { Schema, model, type HydratedDocument } from "mongoose";

import {
  ISSUE_PRIORITIES,
  ISSUE_SOURCES,
  ISSUE_STATUSES,
  ISSUE_TYPES,
  TIMELINE_KINDS,
  TIMELINE_VISIBILITIES,
  type IssuePriority,
  type IssueStatus,
  type IssueTimelineKind,
  type IssueTimelineVisibility,
} from "../domain/issue.types.js";

export interface IssueTimelineEntry {
  at: Date;
  /** Null for what the system did by itself. */
  actorId: string | null;
  kind: IssueTimelineKind;
  from?: string;
  to?: string;
  body?: string;
  visibility: IssueTimelineVisibility;
}

export interface IIssue {
  /** What people quote to each other: "SPK-1042". */
  reference: string;
  type: (typeof ISSUE_TYPES)[number];
  title: string;
  description: string;
  status: IssueStatus;
  priority: IssuePriority;
  source: (typeof ISSUE_SOURCES)[number];
  /** A snapshot, so an issue stays readable whatever later happens to the account. */
  reportedBy: { userId: string; name: string; username: string };
  handledBy: { userId: string; name: string; assignedAt: Date } | null;
  context: {
    platform?: string;
    appVersion?: string;
    os?: string;
    device?: string;
    screen?: string;
    locale?: string;
    timezone?: string;
  };
  /** In the schema for the IT team's app; nothing uploads to it yet. */
  attachments: { url: string; kind: string }[];
  resolution: { summary: string; resolvedBy: string; resolvedAt: Date } | null;
  timeline: IssueTimelineEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export type IssueDoc = HydratedDocument<IIssue>;

const person = { _id: false };

const schema = new Schema<IIssue>(
  {
    reference: { type: String, required: true, unique: true },
    type: { type: String, enum: ISSUE_TYPES, required: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, enum: ISSUE_STATUSES, default: "open" },
    priority: { type: String, enum: ISSUE_PRIORITIES, default: "normal" },
    source: { type: String, enum: ISSUE_SOURCES, required: true },
    reportedBy: {
      type: new Schema(
        {
          userId: { type: String, required: true },
          name: { type: String, default: "" },
          username: { type: String, default: "" },
        },
        person,
      ),
      required: true,
    },
    handledBy: {
      type: new Schema(
        {
          userId: { type: String, required: true },
          name: { type: String, default: "" },
          assignedAt: { type: Date, required: true },
        },
        person,
      ),
      default: null,
    },
    context: {
      type: new Schema(
        {
          platform: String,
          appVersion: String,
          os: String,
          device: String,
          screen: String,
          locale: String,
          timezone: String,
        },
        person,
      ),
      default: {},
    },
    attachments: {
      type: [new Schema({ url: String, kind: String }, person)],
      default: [],
    },
    resolution: {
      type: new Schema(
        {
          summary: { type: String, default: "" },
          resolvedBy: { type: String, required: true },
          resolvedAt: { type: Date, required: true },
        },
        person,
      ),
      default: null,
    },
    timeline: {
      type: [
        new Schema(
          {
            at: { type: Date, required: true },
            actorId: { type: String, default: null },
            kind: { type: String, enum: TIMELINE_KINDS, required: true },
            from: String,
            to: String,
            body: String,
            visibility: { type: String, enum: TIMELINE_VISIBILITIES, required: true },
          },
          person,
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

schema.index({ "reportedBy.userId": 1, createdAt: -1 });
schema.index({ status: 1, priority: 1, createdAt: -1 });
schema.index({ "handledBy.userId": 1 });

export const Issue = model<IIssue>("Issue", schema);
