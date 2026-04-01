import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const schema = new mongoose.Schema({
  email: {
    required: true,
    trim: true,
    type: String,
    unique: true,
  },
  password: String,
  name: String,
  role: {
    type: String,
    default: "client",
  },
});

schema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      name: this.name,
      email: this.email,
      role: this.role,
    },
    process.env.jwtPrivateKey,
  );
};

export const User = mongoose.model("User", schema);
