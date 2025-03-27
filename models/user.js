import mongoose from "mongoose";
import Joi from "joi";
import jwt from "jsonwebtoken";

const schema = new mongoose.Schema({
    authCode: String,
    bio: String,
    coverImage: String,
    email: {
        type: String,
        required: true,
        unique: true,
    },
    expoPushToken: Object,
    followers: Object,
    following: Object,
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
        unique: true,
    },
    feedToken: String,
    chatToken: String,
    youtube: String,
    linkedIn: String,
    instagram: String,
    customLink: String,
    communities: [String],
    name: {
        type: String,
        required: true,
    },
    invalid: {
        type: Boolean,
        default: false,
    },
    isSchOfficial: {
        type: Boolean,
        default: false,
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
            bio: this.bio,
            invalid: this.invalid,
            chatToken: this.chatToken,
            email: this.email,
            feedToken: this.feedToken,
            name: this.name,
            profileImage: this.profileImage,
            username: this.username,
            verified: this.verified,
            isAdmin: this.isAdmin
        },
        process.env.jwtPrivateKey
    );
};

export const User = mongoose.model("User", schema);

export const validateUser = (user) =>
    Joi.object({
        authCode: Joi.number().required(),
        bio: Joi.string().optional(),
        coverImage: Joi.string().optional(),
        email: Joi.string().required(),
        invalid: Joi.boolean().optional(),
        name: Joi.string().required(),
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
        instagram: Joi.string().optional(),
        customLink: Joi.string().optional(),
        email: Joi.string().required(),
        name: Joi.string().required(),
    }).validate(user);
