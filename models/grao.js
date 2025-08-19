import mongoose from "mongoose";

export const Grao = mongoose.model(
    "Grao",
    new mongoose.Schema({
        prompt: {
            type: String,
            required: true,
            trim: true,
        },
        response: {
            type: String,
            required: true,
            trim: true,
        },
        timestamp: {
            type: Number,
            default: function () {
                return this._id.getTimestamp();
            },
        },
    })
);
