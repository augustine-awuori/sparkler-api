import mongoose from "mongoose";

const schema = new mongoose.Schema({
  description: String,
  name: String,
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  timestamp: {
    type: Date,
    default: function () {
      return this._id ? this._id.getTimestamp() : new Date();
    },
  },
  expectedArrivalTime: Date,
  done: Date,
});

export const Delivery = mongoose.model("Delivery", schema);
