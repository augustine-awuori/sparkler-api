import { Schema, model } from "mongoose";
import Joi from "joi";

import { objectIdTimestamp } from "./timestamp.js";

export interface IReport {
  title: string;
  description: string;
  latitude?: number;
  longitude?: number;
  images: string[];
  seen: boolean;
  timestamp: number;
}

export const Report = model<IReport>(
  "Report",
  new Schema<IReport>({
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 100,
    },
    description: {
      type: String,
      required: true,
      trim: true,
      minlength: 5,
      maxlength: 255,
    },
    latitude: {
      type: Number,
      required: false,
    },
    longitude: {
      type: Number,
      required: false,
    },
    images: {
      type: [String],
      default: [],
    },
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

export const validateReport = (report: unknown) =>
  Joi.object({
    title: Joi.string().min(3).max(100).required().label("Report title"),
    description: Joi.string().min(5).max(255).required().label("Report description"),
    latitude: Joi.number().optional(),
    longitude: Joi.number().optional(),
    images: Joi.array().items(Joi.string()).max(4).optional(),
  }).validate(report);
