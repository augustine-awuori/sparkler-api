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
    phone: {
      type: String,
      trim: true,
    },
    course: {
      type: String,
      required: true,
    },
    school: {
      type: mongoose.Types.ObjectId,
      ref: "School",
      required: true,
    },
    regNo: {
      required: true,
      trim: true,
      type: String,
      uppercase: true,
      unique: true,
    },
  })
);

export const validateBug = (bug) =>
  Joi.object({
    message: Joi.string().min(1).required(),
  }).validate(bug);
