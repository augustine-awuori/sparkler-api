import { Schema, model, type HydratedDocument } from "mongoose";

import { BOOKMARK_KINDS, type BookmarkKind } from "../domain/errorTracking.types.js";

/** One team member saving an error or a report to come back to. Only they see it. */
export interface IBookmark {
  developerId: string;
  kind: BookmarkKind;
  /** An `ErrorGroup` id for "error", an `Issue` id for "issue". */
  targetId: string;
  createdAt: Date;
}

export type BookmarkDoc = HydratedDocument<IBookmark>;

const schema = new Schema<IBookmark>({
  developerId: { type: String, required: true },
  kind: { type: String, enum: BOOKMARK_KINDS, required: true },
  targetId: { type: String, required: true },
  createdAt: { type: Date, default: () => new Date() },
});

// Also serves listing someone's bookmarks, by its `developerId` prefix.
schema.index({ developerId: 1, kind: 1, targetId: 1 }, { unique: true });

export const Bookmark = model<IBookmark>("Bookmark", schema);
