import type { Types } from "mongoose";

/**
 * Schema default for `timestamp` fields: the document's creation time, taken
 * from its ObjectId, in epoch milliseconds.
 */
export function objectIdTimestamp(this: { _id: Types.ObjectId }): number {
  return this._id.getTimestamp().getTime();
}
