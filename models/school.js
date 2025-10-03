import mongoose from "mongoose";

const schema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
});

export const School = mongoose.model("School", schema);
