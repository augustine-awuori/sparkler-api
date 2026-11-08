import { Schema, model, type HydratedDocument } from "mongoose";

import {
  ASSIGNMENT_STATES,
  ERROR_APPS,
  ERROR_GROUP_STATUSES,
  ERROR_TIMELINE_KINDS,
  type AssignmentState,
  type ErrorApp,
  type ErrorGroupStatus,
  type ErrorTimelineKind,
} from "../domain/errorTracking.types.js";

/** A snapshot, so history stays readable after someone leaves the team. */
export interface DeveloperRef {
  developerId: string;
  name: string;
}

export interface ErrorTimelineEntry {
  at: Date;
  /** Null for what the system did by itself, such as a regression. */
  by: DeveloperRef | null;
  kind: ErrorTimelineKind;
  from?: string;
  to?: string;
  body?: string;
}

export interface Assignment extends DeveloperRef {
  assignedBy: DeveloperRef;
  assignedAt: Date;
  state: AssignmentState;
  respondedAt: Date | null;
}

export interface IErrorGroup {
  fingerprint: string;
  app: ErrorApp;
  errorClass: string;
  message: string;
  context: string;
  status: ErrorGroupStatus;
  regressed: boolean;
  firstSeen: Date;
  lastSeen: Date;
  eventCount: number;
  /** Capped at USER_ID_CAP, so a widespread crash can't grow the document without bound. */
  userIds: string[];
  versions: string[];
  firstVersion: string;
  lastVersion: string;
  assignee: Assignment | null;
  resolvedBy: DeveloperRef | null;
  resolvedAt: Date | null;
  resolvedInVersion: string;
  resolutionNote: string;
  timeline: ErrorTimelineEntry[];
  createdAt: Date;
  updatedAt: Date;
}

export const USER_ID_CAP = 1_000;
export const VERSION_CAP = 50;

export type ErrorGroupDoc = HydratedDocument<IErrorGroup>;

const plain = { _id: false };
const developerRef = new Schema<DeveloperRef>(
  { developerId: { type: String, required: true }, name: { type: String, default: "" } },
  plain,
);

const schema = new Schema<IErrorGroup>(
  {
    fingerprint: { type: String, required: true, unique: true },
    app: { type: String, enum: ERROR_APPS, required: true },
    errorClass: { type: String, default: "Error" },
    message: { type: String, default: "" },
    context: { type: String, default: "" },
    status: { type: String, enum: ERROR_GROUP_STATUSES, default: "open" },
    regressed: { type: Boolean, default: false },
    firstSeen: { type: Date, required: true },
    lastSeen: { type: Date, required: true },
    eventCount: { type: Number, default: 0 },
    userIds: { type: [String], default: [] },
    versions: { type: [String], default: [] },
    firstVersion: { type: String, default: "" },
    lastVersion: { type: String, default: "" },
    assignee: {
      type: new Schema<Assignment>(
        {
          developerId: { type: String, required: true },
          name: { type: String, default: "" },
          assignedBy: { type: developerRef, required: true },
          assignedAt: { type: Date, required: true },
          state: { type: String, enum: ASSIGNMENT_STATES, required: true },
          respondedAt: { type: Date, default: null },
        },
        plain,
      ),
      default: null,
    },
    resolvedBy: { type: developerRef, default: null },
    resolvedAt: { type: Date, default: null },
    resolvedInVersion: { type: String, default: "" },
    resolutionNote: { type: String, default: "" },
    timeline: {
      type: [
        new Schema<ErrorTimelineEntry>(
          {
            at: { type: Date, required: true },
            by: { type: developerRef, default: null },
            kind: { type: String, enum: ERROR_TIMELINE_KINDS, required: true },
            from: String,
            to: String,
            body: String,
          },
          plain,
        ),
      ],
      default: [],
    },
  },
  { timestamps: true },
);

schema.index({ status: 1, lastSeen: -1 });
schema.index({ app: 1, lastSeen: -1 });
schema.index({ "assignee.developerId": 1, status: 1 });
schema.index({ "resolvedBy.developerId": 1, resolvedAt: -1 });

export const ErrorGroup = model<IErrorGroup>("ErrorGroup", schema);
