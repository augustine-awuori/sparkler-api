import mongoose from "mongoose";

const schema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
});

export const Department = mongoose.model("Department", schema);
