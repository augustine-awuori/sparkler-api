import { Schema, model, type Types } from "mongoose";

export interface IPushToken {
  userId: Types.ObjectId;
  pushToken: string;
}

/**
 * One row per device. Unique on the token, not the account: an account can be on
 * several phones, but a phone belongs to whoever signed in on it last, so the
 * previous account's notifications stop arriving there.
 */
export const PushToken = model<IPushToken>(
  "PushToken",
  new Schema<IPushToken>({
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Sparkler",
      required: true,
      index: true,
    },
    pushToken: { type: String, required: true, unique: true },
  }),
);
