import mongoose from "mongoose";
import Joi from "joi";

export const Bug = mongoose.model(
    "Bug",
    new mongoose.Schema({
        solved: {
            type: Boolean,
            default: false,
        },
        message: {
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
