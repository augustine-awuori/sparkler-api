import mongoose from "mongoose";
import Joi from "joi";

export const Course = mongoose.model("Course", new mongoose.Schema({
    lecturer: { type: mongoose.Types.ObjectId, ref: "Person" },
    category: { type: mongoose.Types.ObjectId, ref: "Category" },
    description: {
        maxlength: 200,
        trim: true,
        type: String,
    },
    images: [String],
    name: {
        maxlength: 50,
        minlength: 2,
        required: true,
        trim: true,
        type: String,
    },
    timestamp: {
        type: Number,
        default: function () {
            return this._id.getTimestamp();
        },
    },
}));

export const validateCourse = (course) =>
    Joi.object({
        lecturer: Joi.string().hex().length(24).required(),
        category: Joi.string().hex().length(24).required(),
        description: Joi.string().max(200).trim().optional().allow(""),
        images: Joi.array().items(Joi.string().uri()).optional(),
        name: Joi.string().min(2).max(50).trim().required(),
    }).validate(course);
