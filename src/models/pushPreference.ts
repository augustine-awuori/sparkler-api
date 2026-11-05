import { Schema, model, type Types } from "mongoose";

export const PUSH_CATEGORIES = [
  "sparkles",
  "replies",
  "likes",
  "mentions",
  "follows",
  "messages",
] as const;

export type PushCategory = (typeof PUSH_CATEGORIES)[number];

export interface IPushPreference {
  userId: Types.ObjectId;
  off: PushCategory[];
}

/**
 * What someone has turned off, for the pushes this API sends. Stream keeps its
 * own copy for the pushes it sends, but `queryUsers` doesn't return it, so the
 * server can't read that one. Absent means everything is on.
 */
export const PushPreference = model<IPushPreference>(
  "PushPreference",
  new Schema<IPushPreference>({
    userId: { type: Schema.Types.ObjectId, ref: "Sparkler", required: true, unique: true },
    off: { type: [String], enum: PUSH_CATEGORIES, default: [] },
  }),
);
