import mongoose from "mongoose";
import Joi from "joi";

export const Feedback = mongoose.model(
    "Feedback",
    new mongoose.Schema({
        message: {
            type: String,
            required: true,
        },
    })
);

export const validateFeedback = (feedback) =>
    Joi.object({
        message: Joi.string().min(1).required(),
    }).validate(feedback);

export default { Feedback, validateFeedback };
