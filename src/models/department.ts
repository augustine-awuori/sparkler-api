import { Schema, model, type Types } from "mongoose";

export interface IDepartment {
  name: string;
  school: Types.ObjectId;
}

const schema = new Schema<IDepartment>({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  school: {
    type: Schema.Types.ObjectId,
    ref: "School",
    required: true,
  },
});

export const Department = model<IDepartment>("Department", schema);
