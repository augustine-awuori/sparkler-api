import mongoose from "mongoose";

const schema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true,
  },
  short_label: {
    type: String,
    required: true,
    trim: true,
  },
});

export const School = mongoose.model("School", schema);
