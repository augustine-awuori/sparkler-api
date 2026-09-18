import { Schema, model, type Types } from "mongoose";

export interface IProgramme {
  name: string;
  school: Types.ObjectId;
}

const schema = new Schema<IProgramme>({
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

export const Programme = model<IProgramme>("Programme", schema);
