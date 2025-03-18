import mongoose from "mongoose";
import Joi from "joi";

export const Community = mongoose.model(
    "Community",
    new mongoose.Schema({
        creator: { type: mongoose.Types.ObjectId, ref: "User", required: true },
        name: {
            type: String,
            unique: true,
            required: true,
            trim: true,
        },
        isVerified: { type: Boolean, default: false },
        bio: String,
        profileImage: String,
        coverImage: String,
        members: [{ type: mongoose.Types.ObjectId, ref: 'User' }]
    })
);

export const validateCommunity = (community) =>
    Joi.object({
        creator: Joi.string().optional(),
        name: Joi.string().required(),
        bio: Joi.string().optional(),
    }).validate(community);
