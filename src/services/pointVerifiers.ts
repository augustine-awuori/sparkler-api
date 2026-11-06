import type { PointAction } from "../domain/points.js";
import { streamClient } from "./stream.js";

/** Whether Stream agrees this user really did this, to this target. */
type PointVerifier = (userId: string, targetId: string) => Promise<boolean>;

const RESPARKLE = "resparkle";

interface Authored {
  user?: { id?: string };
  custom?: Record<string, unknown> | null;
  type?: string;
  parent?: unknown;
}

/**
 * Anonymous posts earn nothing: the public total rising right after one could
 * point at who wrote it.
 */
const isOwnNamedPost = (post: Authored, userId: string): boolean =>
  post.user?.id === userId && post.custom?.anonymous !== true;

const readActivity = async (id: string): Promise<Authored> =>
  (await streamClient().feeds.getActivity({ id })).activity;

const readComment = async (id: string): Promise<Authored> =>
  (await streamClient().feeds.getComment({ id })).comment;

/** Filtered by user, then checked again, so a filter Stream ignored can't award anyone. */
async function hasReactedToActivity(userId: string, activityId: string, type: string) {
  const { reactions } = await streamClient().feeds.queryActivityReactions({
    activity_id: activityId,
    filter: { reaction_type: type, user_id: userId },
    limit: 25,
  });
  return reactions.some((reaction) => reaction.user.id === userId && reaction.type === type);
}

async function hasReactedToComment(userId: string, commentId: string, type: string) {
  const { reactions } = await streamClient().feeds.queryCommentReactions({
    id: commentId,
    filter: { reaction_type: type, user_id: userId },
    limit: 25,
  });
  return reactions.some((reaction) => reaction.user.id === userId && reaction.type === type);
}

/** Your own post is the one thing you can't earn from reacting to. */
const reactedToSomeoneElsesActivity =
  (type: string): PointVerifier =>
  async (userId, activityId) =>
    (await readActivity(activityId)).user?.id !== userId &&
    (await hasReactedToActivity(userId, activityId, type));

const reactedToSomeoneElsesComment =
  (type: string): PointVerifier =>
  async (userId, commentId) =>
    (await readComment(commentId)).user?.id !== userId &&
    (await hasReactedToComment(userId, commentId, type));

export const POINT_VERIFIERS: Record<PointAction, PointVerifier> = {
  sparkle: async (userId, activityId) => {
    const activity = await readActivity(activityId);
    return isOwnNamedPost(activity, userId) && activity.type !== RESPARKLE && !activity.parent;
  },
  quote: async (userId, activityId) => {
    const activity = await readActivity(activityId);
    return isOwnNamedPost(activity, userId) && activity.type !== RESPARKLE && Boolean(activity.parent);
  },
  reply: async (userId, commentId) => isOwnNamedPost(await readComment(commentId), userId),

  like: reactedToSomeoneElsesActivity("like"),
  resparkle: reactedToSomeoneElsesActivity(RESPARKLE),
  reply_like: reactedToSomeoneElsesComment("like"),
  reply_resparkle: reactedToSomeoneElsesComment(RESPARKLE),

  bookmark: async (userId, activityId) => {
    if ((await readActivity(activityId)).user?.id === userId) return false;
    const { bookmarks } = await streamClient().feeds.queryBookmarks({
      filter: { user_id: userId, activity_id: activityId },
      limit: 1,
    });
    return bookmarks.some((bookmark) => bookmark.user.id === userId);
  },

  follow: async (userId, theirId) => {
    if (theirId === userId) return false;
    const { follows } = await streamClient().feeds.queryFollows({
      filter: { source_feed: `timeline:${userId}`, target_feed: `user:${theirId}` },
      limit: 1,
    });
    return follows.length > 0;
  },

  poll_vote: async (userId, pollId) => {
    const { votes } = await streamClient().queryPollVotes({
      poll_id: pollId,
      user_id: userId,
      filter: { user_id: userId },
      limit: 25,
    });
    return votes.some((vote) => vote.user_id === userId);
  },
};
