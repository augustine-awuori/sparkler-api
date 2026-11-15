import { ForbiddenError, UpstreamError } from "../domain/errors.js";
import { PushAnnouncement } from "../models/pushAnnouncement.js";
import type { PushPayload } from "../utils/pushNotifications.js";
import {
  claimAnnouncement,
  deliverInBackground,
  handleOf,
  pushBody,
  pushTitle,
  stringOrUndefined,
} from "./announcements.js";
import { everyoneWithAPushToken } from "./pushAudience.js";
import { streamClient } from "./stream.js";

const NEW_SPARKLE = "shared a new sparkle";
const FOLLOWS_PER_PAGE = 100;
/** Each anonymous sparkle reaches every account, so one person can't do it endlessly. */
export const MAX_ANONYMOUS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

export type AnnouncementOutcome = "announced" | "already_announced" | "not_public" | "rate_limited";

/**
 * Tells the right people about a new sparkle.
 *
 * Everything sent is read from Stream rather than taken from the request, so an
 * account can only announce a sparkle it really wrote, in its real words.
 * Resolves once the announcement is claimed; the sending carries on behind it so
 * a large audience can't time out the author's request.
 */
export async function announceSparkle(
  authorId: string,
  activityId: string,
): Promise<AnnouncementOutcome> {
  const activity = await readActivity(activityId);
  if (activity.user.id !== authorId) throw new ForbiddenError("Not your sparkle");
  if (activity.visibility !== "public") return "not_public";

  const anonymous = activity.custom?.["anonymous"] === true;
  if (anonymous && (await anonymousInLastHour(authorId)) >= MAX_ANONYMOUS_PER_HOUR) {
    return "rate_limited";
  }

  if (!(await claimAnnouncement(activityId, authorId, anonymous))) return "already_announced";

  const { recipients, push } = anonymous ? anonymousPlan(activity) : followersPlan(activity);
  deliverInBackground(authorId, recipients, "sparkles", push, "Could not announce a sparkle");
  return "announced";
}

type Activity = Awaited<ReturnType<typeof readActivity>>;

interface AnnouncementPlan {
  recipients: () => Promise<string[]>;
  push: PushPayload;
}

async function readActivity(activityId: string) {
  try {
    const { activity } = await streamClient().feeds.getActivity({ id: activityId });
    return activity;
  } catch (err) {
    throw new UpstreamError("Could not read that sparkle", err);
  }
}

function anonymousInLastHour(authorId: string): Promise<number> {
  return PushAnnouncement.countDocuments({
    authorId,
    anonymous: true,
    createdAt: { $gte: new Date(Date.now() - HOUR_MS) },
  });
}

function followersPlan(activity: Activity): AnnouncementPlan {
  const author = activity.user;
  const handle = handleOf(author);
  // These people get their own, more specific push ("mentioned you") from the
  // author's app, and one action should mean one buzz.
  const toldSeparately = new Set([
    ...(activity.mentioned_users ?? []).map((user) => user.id),
    ...(activity.parent ? [activity.parent.user.id] : []),
  ]);

  return {
    recipients: async () =>
      (await acceptedFollowerIds(author.id)).filter((id) => !toldSeparately.has(id)),
    push: {
      title: pushTitle(author.name, handle),
      message: pushBody(activity.text, NEW_SPARKLE),
      data: { kind: "sparkle", type: "sparkle", id: activity.id, ...(handle ? { handle } : {}) },
    },
  };
}

function anonymousPlan(activity: Activity): AnnouncementPlan {
  return {
    recipients: everyoneWithAPushToken,
    push: {
      title: stringOrUndefined(activity.custom?.["anonymous_alias"]) ?? "Anonymous",
      message: pushBody(activity.text, NEW_SPARKLE),
      // No handle: it would name the author on every lock screen it reaches.
      data: { kind: "sparkle", type: "sparkle", id: activity.id },
    },
  };
}

/** A follower's id is their source feed's own id: `timeline:<id>` follows `user:<id>`. */
async function acceptedFollowerIds(authorId: string): Promise<string[]> {
  const ids = new Set<string>();
  let next: string | undefined;

  do {
    const page = await streamClient().feeds.queryFollows({
      filter: { target_feed: `user:${authorId}`, status: "accepted" },
      limit: FOLLOWS_PER_PAGE,
      ...(next ? { next } : {}),
    });
    for (const follow of page.follows) {
      if (follow.push_preference !== "none") ids.add(follow.source_feed.id);
    }
    next = page.next;
  } while (next);

  return [...ids];
}
