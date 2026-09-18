import { Schema, model, type HydratedDocument, type Model } from "mongoose";
import jwt from "jsonwebtoken";

import { config } from "../config/index.js";
import type { AuthUser, SparklerCustom } from "../domain/user.types.js";
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
  /** bcrypt hash of the pending sign-in code. Never send it to a client. */
  authCode?: string;
  timestamp: number;
}

export interface SparklerMethods {
  generateAuthToken(): string;
}

type SparklerModel = Model<ISparkler, object, SparklerMethods>;

export type SparklerDoc = HydratedDocument<ISparkler, SparklerMethods>;

const schema = new Schema<ISparkler, SparklerModel, SparklerMethods>({
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
  authCode: String,
  timestamp: {
    type: Number,
    default: objectIdTimestamp,
  },
});

schema.method("generateAuthToken", function (this: SparklerDoc): string {
  const payload: AuthUser = {
    id: this.id,
    ...(this.name === undefined ? {} : { name: this.name }),
    ...(this.image === undefined ? {} : { image: this.image }),
    custom: this.custom,
  };

  return jwt.sign(payload, config().jwtSecret);
});

export const Sparkler = model<ISparkler, SparklerModel>("Sparkler", schema);
