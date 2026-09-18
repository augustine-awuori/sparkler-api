import { Schema, model, type Types } from "mongoose";
import Joi from "joi";

export interface ICommunity {
  creator: Types.ObjectId;
  name: string;
  isVerified: boolean;
  bio?: string;
  profileImage?: string;
  coverImage?: string;
  members: Types.ObjectId[];
  whatsapp?: string;
  instagram?: string;
  youtube?: string;
  customLink?: string;
}

export const Community = model<ICommunity>(
  "Community",
  new Schema<ICommunity>({
    // Was ref: "User", a model that is never registered.
    creator: { type: Schema.Types.ObjectId, ref: "Sparkler", required: true },
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
    members: [{ type: Schema.Types.ObjectId, ref: "Sparkler" }],
    whatsapp: String,
    instagram: String,
    youtube: String,
    customLink: String,
  }),
);

export const validateCommunity = (community: unknown) =>
  Joi.object({
    creator: Joi.string().optional(),
    name: Joi.string().required(),
    bio: Joi.string().optional(),
    whatsapp: Joi.string().uri().optional().allow(""),
    instagram: Joi.string().uri().optional().allow(""),
    youtube: Joi.string().uri().optional().allow(""),
    customLink: Joi.string().uri().optional().allow(""),
  }).validate(community);
