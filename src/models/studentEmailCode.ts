import { Schema, model, type HydratedDocument } from "mongoose";

export interface IStudentEmailCode {
  userId: string;
  email: string;
  codeHash: string;
  attempts: number;
  sentAt: Date;
  expiresAt: Date;
}

export type StudentEmailCodeDoc = HydratedDocument<IStudentEmailCode>;

/** One live code per person. Mongo deletes it once `expiresAt` passes. */
const schema = new Schema<IStudentEmailCode>({
  userId: { type: String, required: true, unique: true },
  email: { type: String, required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  sentAt: { type: Date, required: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
});

export const StudentEmailCode = model<IStudentEmailCode>("StudentEmailCode", schema);
