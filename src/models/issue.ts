import { Schema, model, type Types } from "mongoose";

import { objectIdTimestamp } from "./timestamp.js";

export interface IIssue {
  reporter: Types.ObjectId;
  sparkle?: string;
  label?: string;
  value?: string;
  subIssues: unknown[];
  seen: boolean;
  timestamp: number;
}

export const Issue = model<IIssue>(
  "Issue",
  new Schema<IIssue>({
    // Was ref: "User", a model that is never registered.
    reporter: { type: Schema.Types.ObjectId, ref: "Sparkler", required: true },
    sparkle: String,
    label: {
      type: String,
      trim: true,
    },
    value: {
      type: String,
      trim: true,
    },
    subIssues: [],
    seen: {
      type: Boolean,
      default: false,
    },
    timestamp: {
      type: Number,
      default: objectIdTimestamp,
    },
  }),
);
