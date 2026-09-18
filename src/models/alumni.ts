import { Schema, model, type Types } from "mongoose";

export interface IAlumni {
  name: string;
  phone?: string;
  course: string;
  school: Types.ObjectId;
  regNo: string;
}

export const Alumni = model<IAlumni>(
  "Alumni",
  new Schema<IAlumni>({
    name: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    course: {
      type: String,
      required: true,
    },
    school: {
      type: Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    regNo: {
      required: true,
      trim: true,
      type: String,
      uppercase: true,
      unique: true,
    },
  }),
);
