import { Schema, model } from "mongoose";

export interface ISchool {
  label: string;
  short_label: string;
}

const schema = new Schema<ISchool>({
  label: {
    type: String,
    required: true,
    trim: true,
  },
  short_label: {
    type: String,
    required: true,
    trim: true,
  },
});

export const School = model<ISchool>("School", schema);
