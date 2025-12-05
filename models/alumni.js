import mongoose from "mongoose";
import Joi from "joi";

export const Alumni = mongoose.model(
  "Alumni",
  new mongoose.Schema({
    name: {
      type: String,
      required: true,
      trim: true,
    },
    course: {
      type: String,
      required: true,
      trim: true,
    },
    school: {
      type: String,
      required: true,
      trim: true,
    },
    regNo: {
      type: String,
      required: true,
      trim: true,
    },
  })
);

export const validateBug = (bug) =>
  Joi.object({
    message: Joi.string().min(1).required(),
  }).validate(bug);
