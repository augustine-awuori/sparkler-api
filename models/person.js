import mongoose from "mongoose";
import Joi from "joi";
import jwt from "jsonwebtoken";

const schema = new mongoose.Schema({
    profileImage: String,
    email: {
        type: String,
        required: true,
        unique: true,
    },
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
            name: this.name,
        },
        process.env.jwtPrivateKey
    );
};

export const Person = mongoose.model("Person", schema);

export const validateUser = (user) =>
    Joi.object({
        profileImage: Joi.string().optional(),
        email: Joi.string().required(),
        name: Joi.string().required(),
        password: Joi.string().min(6),
    }).validate(user);

export const validateUserWithGoogleAccount = (user) =>
    Joi.object({
        profileImage: Joi.string().optional(),
        email: Joi.string().required(),
        name: Joi.string().required(),
        password: Joi.string().optional(),
    }).validate(user);
