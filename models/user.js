import mongoose from "mongoose";
import Joi from "joi";
import jwt from "jsonwebtoken";

const schema = new mongoose.Schema({
  isOfAge: {
    default: true,
    type: Boolean,
  },
  amazingId: String,
  authCode: String,
  bio: String,
  blockList: [String],
  coverImage: String,
  dob: Date,
  email: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  expoPushToken: Object,
  followers: Object,
  following: Object,
  followersId: [String],
  followingId: [String],
  profileImage: String,
  verified: {
    type: Boolean,
    default: false,
  },
  isAdmin: {
    type: Boolean,
    default: false,
  },
  username: {
    type: String,
    trim: true,
    unique: true,
  },
  feedToken: String,
  chatToken: String,
  youtube: String,
  linkedIn: String,
  instagram: String,
  customLink: String,
  pinnedSparkle: String,
  communities: [String],
  agreeToChildPolicy: {
    type: Boolean,
    default: false,
  },
  agreedToEULA: {
    type: Boolean,
    default: false,
  },
  createsContent: {
    type: Boolean,
    default: false,
  },
  name: {
    type: String,
    required: true,
    trim: true,
  },
  invalid: {
    type: Boolean,
    default: false,
  },
  authDate: {
    type: Date,
    default: null,
  },
  timestamp: {
    type: Number,
    default: function () {
      return this._id.getTimestamp();
    },
  },
});

schema.methods.generateAuthToken = function () {
  return jwt.sign(
    {
      _id: this._id,
      agreedToEULA: this.agreedToEULA,
      bio: this.bio,
      chatToken: this.chatToken,
      email: this.email,
      feedToken: this.feedToken,
      invalid: this.invalid,
      isAdmin: this.isAdmin,
      isOfAge: this.isOfAge,
      name: this.name,
      profileImage: this.profileImage,
      username: this.username,
      verified: this.verified,
    },
    process.env.jwtPrivateKey
  );
};

export const User = mongoose.model("User", schema);

export const validateUser = (user) =>
  Joi.object({
    authCode: Joi.number().required(),
    agreedToEULA: Joi.boolean(),
    bio: Joi.string().optional(),
    amazingId: Joi.string().optional(),
    coverImage: Joi.string().optional(),
    email: Joi.string().required(),
    invalid: Joi.boolean().optional(),
    name: Joi.string().required(),
    username: Joi.string(),
    pinnedSparkle: Joi.string().required(),
    profileImage: Joi.string().optional(),
    youtube: Joi.string().optional(),
    linkedIn: Joi.string().optional(),
    instagram: Joi.string().optional(),
    customLink: Joi.string().optional(),
  }).validate(user);

export const validateUserWithGoogleAccount = (user) =>
  Joi.object({
    coverImage: Joi.string().optional(),
    profileImage: Joi.string().optional(),
    youtube: Joi.string().optional(),
    linkedIn: Joi.string().optional(),
    amazingId: Joi.string().optional(),
    instagram: Joi.string().optional(),
    customLink: Joi.string().optional(),
    email: Joi.string().required(),
    name: Joi.string().required(),
  }).validate(user);
