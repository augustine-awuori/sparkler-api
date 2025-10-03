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
    to: [String],
    verb: String,
});

export const Sparkle = mongoose.model("Sparkle", schema);
