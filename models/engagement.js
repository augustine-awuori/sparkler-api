import mongoose from "mongoose";

const engagementSchema = new mongoose.Schema(
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
engagementSchema.index({ userId: 1, date: 1 });
engagementSchema.index({ action: 1, date: 1 });

const Engagement = mongoose.model("Engagement", engagementSchema);
export default Engagement;
