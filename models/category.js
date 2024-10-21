import Joi from "joi";
import mongoose from "mongoose";

export const Category = mongoose.model("Category", new mongoose.Schema({
  label: {
    max: 50,
    min: 3,
    required: true,
    trim: true,
    type: String,
    unique: true,
  },
}));

export const validate = (category) =>
  Joi.object({
    label: Joi.string().min(3).max(50).required(),
  }).validate(category);

export default { Category, validate, };
