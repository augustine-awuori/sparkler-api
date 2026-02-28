import mongoose from "mongoose";

export const PushToken = mongoose.model(
  "PushToken",
  new mongoose.Schema({
    userId: {
      type: mongoose.Types.ObjectId,
      ref: "Sparkler",
      required: true,
      unique: true,
    },
    pushToken: { type: String, required: true },
  }),
);

export default { PushToken };
