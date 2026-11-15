import { ForbiddenError, UpstreamError } from "../domain/errors.js";
import { claimAnnouncement, deliverInBackground, handleOf, pushBody } from "./announcements.js";
import { streamClient } from "./stream.js";

export type MessageOutcome = "announced" | "already_announced" | "not_a_message";

/** Direct messages are between two people; a little room for small groups. */
const MAX_MEMBERS = 100;
/** What a person sends, as opposed to Stream's system and error messages. */
const SENT_BY_A_PERSON = new Set(["regular", "reply"]);

/**
 * Tells everyone else in a chat about a new message.
 *
 * Stream Chat sends data-only pushes, which Android shows nothing for, and the
 * Stream app has no Firebase provider anyway. So the apps call this after
 * sending, and the push goes through Expo like every other one the API sends.
 * The message, its sender and the members are all read from Stream.
 */
export async function announceMessage(
  senderId: string,
  messageId: string,
): Promise<MessageOutcome> {
  const message = await readMessage(messageId);
  if (message.user.id !== senderId) throw new ForbiddenError("Not your message");
  if (!SENT_BY_A_PERSON.has(message.type)) return "not_a_message";
  if (!(await claimAnnouncement(`message:${messageId}`, senderId))) return "already_announced";

  const handle = handleOf(message.user);
  deliverInBackground(
    senderId,
    () => listeningMembers(message.channel.type, message.channel.id),
    "messages",
    {
      title: message.user.name || (handle ? `@${handle}` : "New message"),
      message: pushBody(message.text, "Sent you an attachment"),
      // The apps address a thread by the other person, so `userId` is the sender.
      data: { kind: "message", type: "message", userId: senderId },
    },
    "Could not announce a message",
  );
  return "announced";
}

async function readMessage(messageId: string) {
  try {
    const { message } = await streamClient().chat.getMessage({ id: messageId });
    return message;
  } catch (err) {
    throw new UpstreamError("Could not read that message", err);
  }
}

/** Members who haven't muted this chat. The sender is dropped later, with blocks. */
async function listeningMembers(type: string, id: string): Promise<string[]> {
  const { members } = await streamClient().chat.queryMembers({
    payload: { type, id, filter_conditions: {}, limit: MAX_MEMBERS },
  });
  return members
    .filter((member) => !member.notifications_muted && !member.banned)
    .map((member) => member.user_id ?? member.user?.id)
    .filter((memberId): memberId is string => Boolean(memberId));
}
