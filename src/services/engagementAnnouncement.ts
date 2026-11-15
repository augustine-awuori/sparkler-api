import { z } from "zod";

import { UpstreamError } from "../domain/errors.js";
import type { PushPayload } from "../utils/pushNotifications.js";
import { claimAnnouncement, deliverInBackground, handleOf, pushBody } from "./announcements.js";
import { POINT_VERIFIERS } from "./pointVerifiers.js";
import { acceptedFollowerIds } from "./pushAudience.js";
import { streamClient } from "./stream.js";

/**
 * What can be announced here. Replies, DMs and new sparkles have their own
 * routes, because they read more than "who did what to whose".
 */
export const ENGAGEMENT_ACTIONS = [
  "like",
  "reply_like",
  "resparkle",
  "reply_resparkle",
  "follow",
] as const;
export type EngagementAction = (typeof ENGAGEMENT_ACTIONS)[number];

export const engagementSchema = z.object({
  action: z.enum(ENGAGEMENT_ACTIONS),
  targetId: z.string().trim().min(1).max(200),
});

/** `not_verified` covers your own post too: Stream says nobody else did anything. */
export type EngagementOutcome = "announced" | "already_announced" | "not_verified";

interface Actor {
  id: string;
  name: string;
  handle?: string;
}

interface Target {
  ownerId: string;
  text?: string;
  /** What a follower's push opens: the sparkle or reply itself. */
  statusId: string;
}

/**
 * Pushes a like, resparkle or follow, as x.com does: the owner hears about it,
 * and a resparkle also reaches the resparkler's followers.
 *
 * These were Stream's to send, and its pushes never reached Android: the Stream
 * app has no Firebase provider. Stream is still asked first whether the caller
 * really did this (`POINT_VERIFIERS`, the same check points use), so an account
 * can't buzz someone with a like it never gave, or about its own post. Each is announced once, so
 * unliking and liking again doesn't buzz a second time.
 */
export async function announceEngagement(
  actorId: string,
  action: EngagementAction,
  targetId: string,
): Promise<EngagementOutcome> {
  if (!(await verified(actorId, action, targetId))) return "not_verified";
  if (!(await claimAnnouncement(`${action}:${actorId}:${targetId}`, actorId))) {
    return "already_announced";
  }

  const actor = await readActor(actorId);
  if (action === "follow") {
    deliverInBackground(actorId, async () => [targetId], "follows", followPush(actor), FAILED);
    return "announced";
  }

  const thing = action.startsWith("reply_") ? "reply" : "sparkle";
  const target = await readTarget(thing, targetId);
  const isResparkle = action === "resparkle" || action === "reply_resparkle";

  deliverInBackground(
    actorId,
    async () => [target.ownerId],
    "likes",
    ownerPush(actor, isResparkle ? "resparkled" : "liked", thing, target),
    FAILED,
  );
  if (isResparkle) {
    deliverInBackground(
      actorId,
      async () => (await acceptedFollowerIds(actorId)).filter((id) => id !== target.ownerId),
      "sparkles",
      followersResparklePush(actor, target),
      FAILED,
    );
  }
  return "announced";
}

const FAILED = "Could not announce an engagement";

async function verified(actorId: string, action: EngagementAction, targetId: string) {
  try {
    return await POINT_VERIFIERS[action](actorId, targetId);
  } catch (err) {
    throw new UpstreamError("Could not check that with Stream", err);
  }
}

async function readActor(actorId: string): Promise<Actor> {
  try {
    const { users } = await streamClient().queryUsers({
      payload: { filter_conditions: { id: actorId }, limit: 1 },
    });
    const user = users[0];
    const handle = handleOf(user);
    return { id: actorId, name: user?.name || (handle ? `@${handle}` : "Someone"), handle };
  } catch {
    return { id: actorId, name: "Someone" };
  }
}

async function readTarget(thing: "sparkle" | "reply", id: string): Promise<Target> {
  const feeds = streamClient().feeds;
  const post =
    thing === "reply"
      ? (await feeds.getComment({ id })).comment
      : (await feeds.getActivity({ id })).activity;
  return { ownerId: post.user.id, text: post.text, statusId: id };
}

function ownerPush(
  actor: Actor,
  verb: "liked" | "resparkled",
  thing: "sparkle" | "reply",
  target: Target,
): PushPayload {
  const kind = verb === "liked" ? "like" : "resparkle";
  return {
    title: `${actor.name} ${verb} your ${thing}`,
    message: pushBody(target.text, `Tap to view your ${thing}`),
    // `type` as well as `kind`: the older app routes on `type`.
    data: { kind, type: kind, id: target.statusId },
  };
}

function followersResparklePush(actor: Actor, target: Target): PushPayload {
  return {
    title: `${actor.name} resparkled`,
    message: pushBody(target.text, "Tap to view the sparkle"),
    data: { kind: "resparkle", type: "resparkle", id: target.statusId },
  };
}

function followPush(actor: Actor): PushPayload {
  return {
    title: `${actor.name} followed you`,
    message: actor.handle ? `@${actor.handle}` : "Tap to view their profile",
    data: {
      kind: "follow",
      type: "follow",
      id: actor.id,
      ...(actor.handle ? { handle: actor.handle } : {}),
    },
  };
}
