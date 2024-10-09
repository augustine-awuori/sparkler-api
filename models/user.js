import mongoose from "mongoose";
import Joi from "joi";
import jwt from "jsonwebtoken";

const schema = new mongoose.Schema({
    coverImage: String,
    profileImage: String,
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
    chatToken: String,
    name: {
        type: String,
        required: true,
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
            profileImage: this.profileImage,
            email: this.email,
            username: this.username,
            feedToken: this.feedToken,
            chatToken: this.chatToken,
            name: this.name,
        },
        process.env.jwtPrivateKey
    );
};

export const User = mongoose.model("User", schema);

export const validateUser = (user) =>
    Joi.object({
        coverImage: Joi.string().optional(),
        profileImage: Joi.string().optional(),
        email: Joi.string().required(),
        name: Joi.string().required(),
        password: Joi.string().min(6),
    }).validate(user);

export const validateUserWithGoogleAccount = (user) =>
    Joi.object({
        coverImage: Joi.string().optional(),
        profileImage: Joi.string().optional(),
        email: Joi.string().required(),
        name: Joi.string().required(),
        password: Joi.string().optional(),
    }).validate(user);
