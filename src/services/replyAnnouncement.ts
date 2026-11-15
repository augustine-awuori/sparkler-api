import { ForbiddenError, UpstreamError } from "../domain/errors.js";
import {
  claimAnnouncement,
  deliverInBackground,
  handleOf,
  mentionPush,
  pushBody,
} from "./announcements.js";
import { streamClient } from "./stream.js";

export type ReplyOutcome = "announced" | "already_announced" | "anonymous";

/**
 * Tells a sparkle's author, and the author of the reply being answered, about a reply.
 *
 * Stream's own reply push never reaches Android, which has no Firebase provider
 * on the Stream app, so the apps set `skip_push` and call this instead; Expo does
 * reach Android. As with sparkles, everything is read from Stream, so an account
 * can only announce its own reply, in its real words, to the people it really
 * answered. Anonymous replies keep their own path, which shows only the alias.
 */
export async function announceReply(senderId: string, commentId: string): Promise<ReplyOutcome> {
  const reply = await readComment(commentId);
  if (reply.user.id !== senderId) throw new ForbiddenError("Not your reply");
  if (reply.custom?.["anonymous"] === true) return "anonymous";
  if (!(await claimAnnouncement(`comment:${commentId}`, senderId))) return "already_announced";

  const handle = handleOf(reply.user);
  // Read once: both the reply push and the mention push need it.
  let answered: Promise<string[]> | undefined;
  const answeredIds = () => (answered ??= repliedTo(reply));

  deliverInBackground(
    senderId,
    answeredIds,
    "replies",
    {
      title: `${reply.user.name || (handle ? `@${handle}` : "Someone")} replied`,
      message: pushBody(reply.text, "Tap to view the reply"),
      // `type` as well as `kind`: the older app routes on `type`.
      data: { kind: "comment", type: "comment", id: reply.id },
    },
    "Could not announce a reply",
  );

  const mentioned = (reply.mentioned_users ?? []).map((user) => user.id);
  if (mentioned.length) {
    deliverInBackground(
      senderId,
      // Whoever was replied to already hears "replied": one action, one buzz.
      async () => {
        const repliedToIds = new Set(await answeredIds());
        return mentioned.filter((id) => !repliedToIds.has(id));
      },
      "mentions",
      mentionPush(reply.user, reply.text, reply.id),
      "Could not announce a mention",
    );
  }
  return "announced";
}

type Reply = Awaited<ReturnType<typeof readComment>>;

async function readComment(commentId: string) {
  try {
    const { comment } = await streamClient().feeds.getComment({ id: commentId });
    return comment;
  } catch (err) {
    throw new UpstreamError("Could not read that reply", err);
  }
}

/** The sparkle's author, and the parent reply's when this answers a reply. */
async function repliedTo(reply: Reply): Promise<string[]> {
  const feeds = streamClient().feeds;
  const [{ activity }, parent] = await Promise.all([
    feeds.getActivity({ id: reply.object_id }),
    reply.parent_id ? feeds.getComment({ id: reply.parent_id }) : undefined,
  ]);
  return [activity.user.id, ...(parent ? [parent.comment.user.id] : [])];
}
