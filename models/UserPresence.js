import mongoose from "mongoose";

const schema = new mongoose.Schema(
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
    lastActive: {
      type: Date,
      default: Date.now,
    },
    online: {
      type: Boolean,
      default: false,
    },
    onlineTransitions: {
      type: Number,
      default: 0,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

export const UserPresence = mongoose.model("UserPresence", schema);
