import mongoose from "mongoose";

const schema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  school: {
    type: mongoose.Types.ObjectId,
    ref: "School",
    required: true,
  },
});

export const Course = mongoose.model("Course", schema);
