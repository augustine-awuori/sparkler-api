import { Schema, model, type Types } from "mongoose";

export interface IPushToken {
  userId: Types.ObjectId;
  pushToken: string;
}

export const PushToken = model<IPushToken>(
  "PushToken",
  new Schema<IPushToken>({
    userId: {
      type: Schema.Types.ObjectId,
      ref: "Sparkler",
      required: true,
      unique: true,
    },
    pushToken: { type: String, required: true },
  }),
);
