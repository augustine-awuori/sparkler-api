import { Schema, model, type HydratedDocument } from "mongoose";

import {
  DEVELOPER_ROLES,
  DEVELOPER_STATUSES,
  type DeveloperRole,
  type DeveloperStatus,
} from "../domain/errorTracking.types.js";

/**
 * Someone on the team who fixes errors. Kept apart from `Sparkler.custom`, which
 * a profile edit writes, so nobody can make themselves a developer.
 */
export interface IDeveloper {
  sparklerId: string;
  name: string;
  email: string;
  photo: string;
  role: DeveloperRole;
  status: DeveloperStatus;
  requestedAt: Date;
  approvedBy: string | null;
  approvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DeveloperDoc = HydratedDocument<IDeveloper>;

const schema = new Schema<IDeveloper>(
  {
    sparklerId: { type: String, required: true, unique: true },
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    photo: { type: String, default: "" },
    role: { type: String, enum: DEVELOPER_ROLES, default: "developer" },
    status: { type: String, enum: DEVELOPER_STATUSES, default: "pending" },
    requestedAt: { type: Date, required: true },
    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

schema.index({ status: 1, role: 1 });

export const Developer = model<IDeveloper>("Developer", schema);
