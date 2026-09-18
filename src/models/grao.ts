import { Schema, model } from "mongoose";

import { objectIdTimestamp } from "./timestamp.js";

export interface IGrao {
  prompt: string;
  response: string;
  timestamp: number;
}

export const Grao = model<IGrao>(
  "Grao",
  new Schema<IGrao>({
    prompt: {
      type: String,
      required: true,
      trim: true,
    },
    response: {
      type: String,
      required: true,
      trim: true,
    },
    timestamp: {
      type: Number,
      default: objectIdTimestamp,
    },
  }),
);
