import mongoose from "mongoose";
import Joi from "joi";
import jwt from "jsonwebtoken";

const schema = new mongoose.Schema({
    authCode: String,
    coverImage: String,
    profileImage: String,
    bio: String,
    email: {
        type: String,
        required: true,
        unique: true,
    },
    followers: Object,
    following: Object,
    verified: {
        type: Boolean,
        default: false,
    },
    username: {
        type: String,
        unique: true,
    },
    feedToken: String,
    youtube: String,
    tiktok: String,
    instagram: String,
    customLink: String,
    chatToken: String,
    name: {
        type: String,
        required: true,
    },
    invalid: {
        type: Boolean,
        default: false,
    },
    password: {
        type: String,
        minlength: 6,
        maxlength: 1024,
        trim: true,
        validate: {
            validator: function (value) {
                return !value || value.length >= 6;
            },
            message: 'Password must be at least 6 characters long',
        },
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
            verified: this.verified
        },
        process.env.jwtPrivateKey
    );
};

export const User = mongoose.model("User", schema);

export const validateUser = (user) =>
    Joi.object({
        bio: Joi.string().optional(),
        coverImage: Joi.string().optional(),
        email: Joi.string().required(),
        invalid: Joi.boolean().optional(),
        name: Joi.string().required(),
        password: Joi.string().min(6),
        profileImage: Joi.string().optional(),
        youtube: Joi.string().optional(),
        tiktok: Joi.string().optional(),
        instagram: Joi.string().optional(),
        customLink: Joi.string().optional(),
    }).validate(user);

export const validateUserWithGoogleAccount = (user) =>
    Joi.object({
        coverImage: Joi.string().optional(),
        profileImage: Joi.string().optional(),
        youtube: Joi.string().optional(),
        tiktok: Joi.string().optional(),
        instagram: Joi.string().optional(),
        customLink: Joi.string().optional(),
        email: Joi.string().required(),
        name: Joi.string().required(),
        password: Joi.string().optional(),
    }).validate(user);
