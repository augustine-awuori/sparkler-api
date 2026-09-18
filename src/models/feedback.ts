import { Schema, model } from "mongoose";
import Joi from "joi";

export interface IFeedback {
  message: string;
}

export const Feedback = model<IFeedback>(
  "Feedback",
  new Schema<IFeedback>({
    message: {
      type: String,
      required: true,
    },
  }),
);

export const validateFeedback = (feedback: unknown) =>
  Joi.object({
    message: Joi.string().min(1).required(),
  }).validate(feedback);
