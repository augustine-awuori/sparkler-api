import mongoose from "mongoose";
import Joi from "joi";
import jwt from "jsonwebtoken";

const schema = new mongoose.Schema({
    avatar: String,
    email: {
        type: String,
        required: true,
        unique: true,
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
            avatar: this.avatar,
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
        avatar: Joi.string(),
        email: Joi.string().required(),
        name: Joi.string(),
        password: Joi.string(),
    }).validate(user);
