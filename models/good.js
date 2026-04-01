import mongoose from "mongoose";

const schema = new mongoose.Schema({
  description: String,
  name: String,
  delivery: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Delivery",
  },
});

export const Good = mongoose.model("Good", schema);
