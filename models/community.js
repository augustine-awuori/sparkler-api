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
        members: [{ type: mongoose.Types.ObjectId, ref: 'User' }],
        whatsapp: String,
        instagram: String,
        youtube: String,
        customLink: String
    })
);

export const validateCommunity = (community) =>
    Joi.object({
        creator: Joi.string().optional(),
        name: Joi.string().required(),
        bio: Joi.string().optional(),
        whatsapp: Joi.string().uri().optional().allow(''),
        instagram: Joi.string().uri().optional().allow(''),
        youtube: Joi.string().uri().optional().allow(''),
        customLink: Joi.string().uri().optional().allow(''),
    }).validate(community);