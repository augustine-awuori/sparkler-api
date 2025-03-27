import mongoose from "mongoose";
import Joi from "joi";

export const Report = mongoose.model(
    "Report",
    new mongoose.Schema({
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
        timestamp: {
            type: Number,
            default: function () {
                return this._id.getTimestamp();
            },
        },
    })
);

export const validateReport = (report) =>
    Joi.object({
        title: Joi.string().min(3).max(100).required().label("Report title"),
        description: Joi.string().min(5).max(255).required().label("Report description"),
        latitude: Joi.number().optional(),
        longitude: Joi.number().optional(),
        images: Joi.array().items(Joi.string()).max(4).optional(),
    }).validate(report);