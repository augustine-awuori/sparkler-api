import { Schema, model, type HydratedDocument, type Types } from "mongoose";

import type { ErrorEventInput } from "../domain/errorTracking.types.js";

/** Events are evidence, not records: they expire, while their group stays. */
export const EVENT_RETENTION_DAYS = 90;

export type IErrorEvent = Omit<ErrorEventInput, "occurredAt"> & {
  groupId: Types.ObjectId;
  occurredAt: Date;
  receivedAt: Date;
};

export type ErrorEventDoc = HydratedDocument<IErrorEvent>;

const schema = new Schema<IErrorEvent>(
  {
    groupId: { type: Schema.Types.ObjectId, required: true },
    app: { type: String, required: true },
    errorClass: { type: String, default: "Error" },
    message: { type: String, default: "" },
    stack: String,
    context: String,
    details: { type: Object },
    severity: { type: String, default: "error" },
    handled: { type: Boolean, default: true },
    occurredAt: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
    appVersion: String,
    buildNumber: String,
    releaseStage: String,
    platform: String,
    os: String,
    osVersion: String,
    device: String,
    browser: String,
    screen: String,
    userId: String,
    sessionId: String,
    locale: String,
    timezone: String,
    online: Boolean,
    breadcrumbs: {
      type: [
        new Schema(
          { at: Date, type: String, message: String, data: { type: Object } },
          { _id: false },
        ),
      ],
      default: [],
    },
  },
  { versionKey: false },
);

schema.index({ groupId: 1, _id: -1 });
schema.index({ receivedAt: -1, app: 1 });
schema.index({ receivedAt: 1 }, { expireAfterSeconds: EVENT_RETENTION_DAYS * 24 * 60 * 60 });

export const ErrorEvent = model<IErrorEvent>("ErrorEvent", schema);
