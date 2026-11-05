import { Schema, model, type Types } from "mongoose";

export interface IPushAnnouncement {
  activityId: string;
  authorId: Types.ObjectId;
  anonymous: boolean;
  createdAt: Date;
}

/** Long enough that a replayed request for an old sparkle can't reach anyone again. */
const KEPT_SECONDS = 30 * 24 * 60 * 60;

const schema = new Schema<IPushAnnouncement>({
  activityId: { type: String, required: true, unique: true },
  authorId: { type: Schema.Types.ObjectId, ref: "Sparkler", required: true },
  anonymous: { type: Boolean, required: true },
  createdAt: { type: Date, default: Date.now, expires: KEPT_SECONDS },
});

schema.index({ authorId: 1, anonymous: 1, createdAt: -1 });

export const PushAnnouncement = model<IPushAnnouncement>("PushAnnouncement", schema);
