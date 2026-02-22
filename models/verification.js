import mongoose from "mongoose";

const schema = new mongoose.Schema({
  user: { type: mongoose.Types.ObjectId, ref: "Sparkler" },
  image: String,
  staff: Boolean,
  student: Boolean,
  valid: Boolean,
  timestamp: {
    type: Number,
    default: function () {
      return this._id.getTimestamp();
    },
  },
});

export const Verification = mongoose.model("Verification", schema);
