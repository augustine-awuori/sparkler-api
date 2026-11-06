import { Schema, model, type HydratedDocument } from "mongoose";

export interface ICommunity {
  slug: string;
  name: string;
  description: string;
  /** A `/schools` id, for a society at one school. Absent means open to anyone. */
  school?: string;
  createdBy: string;
  memberCount: number;
  createdAt: Date;
}

export type CommunityDoc = HydratedDocument<ICommunity>;

const schema = new Schema<ICommunity>(
  {
    slug: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: "" },
    school: { type: String, index: true },
    createdBy: { type: String, required: true, index: true },
    memberCount: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export const Community = model<ICommunity>("Community", schema);

export interface ICommunityMember {
  communityId: string;
  userId: string;
}

const memberSchema = new Schema<ICommunityMember>({
  communityId: { type: String, required: true },
  userId: { type: String, required: true, index: true },
});
// What makes joining twice count once.
memberSchema.index({ communityId: 1, userId: 1 }, { unique: true });

export const CommunityMember = model<ICommunityMember>("CommunityMember", memberSchema);
