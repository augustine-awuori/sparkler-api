import mongoose from "mongoose";

const schema = new mongoose.Schema(
  {
    userId: { type: String, required: true, index: true, ref: "User" },
    action: {
      type: String,
      enum: [
        "like",
        "comment",
        "reply",
        "repost",
        "quote",
        "view",
        "profile_view",
      ],
      required: true,
    },
    targetId: { type: String }, // Post ID, Profile ID, etc.
    targetType: { type: String, enum: ["post", "profile", "comment"] },
    date: { type: String, required: true, index: true }, // YYYY-MM-DD
    timestamp: { type: Date, default: Date.now },
    metadata: { type: Object }, // Extra info (campus, etc.)
  },
  { timestamps: true },
);

// Indexes for fast analytics
schema.index({ userId: 1, date: 1 });
schema.index({ action: 1, date: 1 });

export const Engagement = mongoose.model("Engagement", schema);
