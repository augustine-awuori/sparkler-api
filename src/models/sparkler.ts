import { Schema, model, type HydratedDocument } from "mongoose";

import type { SparklerCustom } from "../domain/user.types.js";
import { objectIdTimestamp } from "./timestamp.js";

export interface ISparkler {
  /**
   * Unschema'd in Mongo: Mongoose validates nothing inside it, and a partial
   * `custom` in findByIdAndUpdate REPLACES the whole object. Update individual
   * keys with dotted paths ("custom.username").
   */
  custom: SparklerCustom;
  id: string;
  email: string;
  name?: string;
  image?: string;
  timestamp: number;
  /**
   * Beside `custom` rather than in it, because `custom` is what a profile edit
   * writes and what Stream echoes. Only `claimPoints` changes this.
   */
  points: number;
  /**
   * The university address that proved this account, kept off the directory: only
   * `studentVerifiedAt` becomes public, as a badge. Only `confirmStudentCode` sets these.
   */
  studentEmail?: string;
  studentVerifiedAt?: Date;
}

/** JWTs are issued by issueAuthToken in services/authToken.ts, not a model method. */
export type SparklerDoc = HydratedDocument<ISparkler>;

const schema = new Schema<ISparkler>({
  custom: {
    type: Object,
    default: {},
  },
  id: {
    type: String,
    default: function (this: { _id: { toString(): string } }) {
      return this._id.toString();
    },
  },
  email: {
    required: true,
    trim: true,
    type: String,
    unique: true,
  },
  name: String,
  image: String,
  points: { type: Number, default: 0 },
  studentEmail: { type: String, unique: true, sparse: true },
  studentVerifiedAt: Date,
  timestamp: {
    type: Number,
    default: objectIdTimestamp,
  },
});

export const Sparkler = model<ISparkler>("Sparkler", schema);
