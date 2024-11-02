import mongoose from "mongoose";
import Joi from "joi";

export const Lesson = mongoose.model(
    "Lesson",
    new mongoose.Schema({
        title: {
            min: 3,
            required: true,
            trim: true,
            type: String,
        },
        notes: {
            type: String,
            trim: true,
            required: true,
        },
        course: {
            type: mongoose.Types.ObjectId,
            ref: "Course",
            required: true,
        },
    })
);

export const validateLesson = (lesson) =>
    Joi.object({
        course: Joi.string().required(),
        notes: Joi.string().required(),
        title: Joi.string().min(3).trim().optional().allow(""),
    }).validate(lesson);

export default { Lesson, validateLesson }
