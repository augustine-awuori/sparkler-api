import mongoose from "mongoose";

const dailyPostSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true,
    },
    date: {
      type: String,
      required: true,
      index: true,
    },
    postCount: {
      type: Number,
      default: 0,
    },
    postTypes: {
      text: { type: Number, default: 0 },
      photo: { type: Number, default: 0 },
      video: { type: Number, default: 0 },
    },
  },
  { timestamps: true },
);

dailyPostSchema.index({ userId: 1, date: 1 }, { unique: true });

const DailyPost = mongoose.model("DailyPost", dailyPostSchema);

export default DailyPost;
