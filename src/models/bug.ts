import { Schema, model } from "mongoose";
import Joi from "joi";

export interface IBug {
  solved: boolean;
  message: string;
}

export const Bug = model<IBug>(
  "Bug",
  new Schema<IBug>({
    solved: {
      type: Boolean,
      default: false,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
  }),
);

export const validateBug = (bug: unknown) =>
  Joi.object({
    message: Joi.string().min(1).required(),
  }).validate(bug);
