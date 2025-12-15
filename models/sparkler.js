import mongoose from "mongoose";
import jwt from "jsonwebtoken";

const schema = new mongoose.Schema({
  custom: {
    type: Object,
    default: {},
  },
  id: {
    type: String,
    default: function () {
      return this._id.toString();
    },
  },
  email: {
    required: true,
    trim: true,
    type: String,
    unique: true,
  },
  name: String,
  image: String,
  authCode: String,
});

schema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      id: this.id,
      name: this.name,
      image: this.image,
      custom: this.custom,
    },
    process.env.jwtPrivateKey
  );
};

export const Sparkler = mongoose.model("Sparkler", schema);
