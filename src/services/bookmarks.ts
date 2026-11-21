import { ConflictError } from "../domain/errors.js";
import { MAX_BOOKMARKS, type BookmarkKind } from "../domain/errorTracking.types.js";
import { Bookmark } from "../models/bookmark.js";
import { ErrorGroup } from "../models/errorGroup.js";
import { Issue } from "../models/issue.js";
import { groupOr404, toGroupView } from "./errorGroups.js";
import { issueOr404, toStaffView } from "./issues.js";

type BookmarkView = { targetId: string; bookmarkedAt: Date } & (
  | { kind: "error"; group: ReturnType<typeof toGroupView> }
  | { kind: "issue"; issue: ReturnType<typeof toStaffView> }
);

/**
 * Someone's bookmarks, newest first, each carrying the error or report itself,
 * so the dashboard draws the list in one request. One whose item is gone is left out.
 */
export async function listBookmarks(developerId: string): Promise<BookmarkView[]> {
  const bookmarks = await Bookmark.find({ developerId }).sort({ createdAt: -1, _id: -1 });
  const idsOf = (kind: BookmarkKind) =>
    bookmarks.filter((bookmark) => bookmark.kind === kind).map((bookmark) => bookmark.targetId);
  const [groups, issues] = await Promise.all([
    ErrorGroup.find({ _id: { $in: idsOf("error") } }),
    Issue.find({ _id: { $in: idsOf("issue") } }),
  ]);
  const groupById = new Map(groups.map((group) => [group._id.toString(), toGroupView(group)]));
  const issueById = new Map(issues.map((issue) => [issue._id.toString(), toStaffView(issue)]));

  return bookmarks.flatMap(({ kind, targetId, createdAt: bookmarkedAt }): BookmarkView[] => {
    if (kind === "error") {
      const group = groupById.get(targetId);
      return group ? [{ kind, targetId, bookmarkedAt, group }] : [];
    }
    const issue = issueById.get(targetId);
    return issue ? [{ kind, targetId, bookmarkedAt, issue }] : [];
  });
}

/** Bookmarking something twice keeps the first one. */
export async function addBookmark(developerId: string, kind: BookmarkKind, targetId: string): Promise<void> {
  await (kind === "error" ? groupOr404(targetId) : issueOr404(targetId));

  const key = { developerId, kind, targetId };
  if (await Bookmark.exists(key)) return;
  if ((await Bookmark.countDocuments({ developerId })) >= MAX_BOOKMARKS) {
    throw new ConflictError(`You can keep up to ${MAX_BOOKMARKS} bookmarks. Remove one first.`);
  }
  // An upsert, so two quick clicks can't both insert.
  await Bookmark.updateOne(key, { $setOnInsert: { createdAt: new Date() } }, { upsert: true });
}

/** Works whether or not it was bookmarked, and even if the item is gone. */
export async function removeBookmark(developerId: string, kind: BookmarkKind, targetId: string): Promise<void> {
  await Bookmark.deleteOne({ developerId, kind, targetId });
}
