import mongoose from "mongoose";
import Joi from "joi";

export const Issue = mongoose.model(
    "Issue",
    new mongoose.Schema({
        reporter: { type: mongoose.Types.ObjectId, ref: "User", required: true },
        sparkle: String,
        label: {
            type: String,
            trim: true,
        },
        value: {
            type: String,
            trim: true,
        },
        subIssues: [],
        seen: {
            type: Boolean,
            default: false,
        },
        timestamp: {
            type: Number,
            default: function () {
                return this._id.getTimestamp();
            },
        },
    })
);

export const validateIssue = (issue) =>
    Joi.object({
        label: Joi.string().label("Issue label"),
        sparkle: Joi.string().label("Reported sparkle"),
        reporter: Joi.string().label("Issue Reporter"),
        value: Joi.string().label("Issue value"),
        seen: Joi.boolean().label("Issue value"),
    }).validate(issue);