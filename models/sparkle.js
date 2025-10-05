import mongoose from "mongoose";

const schema = new mongoose.Schema({
    actor: String,
    attachments: Object,
    foreign_id: String,
    images: [String],
    moderation_template: String,
    object: String,
    target: String,
    time: String,
    text: String,
    id: String,
    to: [String],
    verb: String,
    timestamp: {
        type: Number,
        default: function () {
            return this._id.getTimestamp();
        },
    },
});

export const Sparkle = mongoose.model("Sparkle", schema);
