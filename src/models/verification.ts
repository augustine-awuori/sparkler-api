import { Schema, model, type Types } from "mongoose";

import { objectIdTimestamp } from "./timestamp.js";

export interface IVerification {
  user?: Types.ObjectId;
  image?: string;
  staff?: boolean;
  student?: boolean;
  valid?: boolean;
  timestamp: number;
}

const schema = new Schema<IVerification>({
  user: { type: Schema.Types.ObjectId, ref: "Sparkler" },
  image: String,
  staff: Boolean,
  student: Boolean,
  valid: Boolean,
  timestamp: {
    type: Number,
    default: objectIdTimestamp,
  },
});

export const Verification = model<IVerification>("Verification", schema);
