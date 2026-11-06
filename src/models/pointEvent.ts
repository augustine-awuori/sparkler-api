import { Schema, model } from "mongoose";

import { POINT_ACTIONS, type PointAction } from "../domain/points.js";

export interface IPointEvent {
  userId: string;
  action: PointAction;
  targetId: string;
  points: number;
  createdAt: Date;
}

const schema = new Schema<IPointEvent>({
  userId: { type: String, required: true },
  action: { type: String, enum: POINT_ACTIONS, required: true },
  targetId: { type: String, required: true },
  points: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// Each thing earns once, ever: this is what makes like-then-unlike worth nothing.
schema.index({ userId: 1, action: 1, targetId: 1 }, { unique: true });
schema.index({ userId: 1, action: 1, createdAt: -1 });

/** The ledger behind `Sparkler.points`. Private: it would link someone to what they did. */
export const PointEvent = model<IPointEvent>("PointEvent", schema);
