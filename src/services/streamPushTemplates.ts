/**
 * What Stream's own pushes say, and where tapping one goes.
 * https://getstream.io/activity-feeds/docs/node/push-template/
 * https://getstream.io/chat/docs/node/push_template/
 *
 * Stream's Firebase defaults send data only, for apps that draw the banner
 * themselves, which the phones don't. So each Firebase template words the banner
 * in `android.notification`, the form Stream's chat docs show, and repeats it in
 * `data` for the web app's service worker. Never a top-level `notification`: the
 * browser shows that one by itself, and the worker would show it a second time.
 *
 * `data` carries the fields both apps already route on (`kind`, `type`, `id`), so
 * a Stream push opens the same screens as one sent through Expo. A status id can
 * be a sparkle or a reply: that screen works out which. Resparkles, quotes and
 * anonymous replies set `skip_push` and go through our own route, because the
 * docs don't confirm a template can branch on a reaction's type or see custom fields.
 */

export type StreamFeedsPushEvent =
  | "feeds.comment.added"
  | "feeds.activity.reaction.added"
  | "feeds.comment.reaction.added"
  | "feeds.follow.created"
  | "feeds.activity.added";

/** Stream Chat's event for a new message, in a DM or a group. */
export const CHAT_MESSAGE_PUSH_EVENT = "message.new";

/** Sent by the notification feed as well, and Stream's direct event already covers each action. */
export const DISABLED_STREAM_PUSH_EVENT = "feeds.notification_feed.updated";

export type StreamPushProviderType = "firebase" | "apn";

export interface StreamPushProvider {
  type: StreamPushProviderType;
  /** Its name on the dashboard's Push providers page, which devices register under. */
  name: string;
}

/** What a banner says. Handlebars, which Stream renders for each recipient. */
interface PushWords {
  title: string;
  body?: string;
}

interface PushCopy extends PushWords {
  kind: string;
  id: string;
}

export const STREAM_PUSH_COPY: Record<StreamFeedsPushEvent, PushCopy> = {
  "feeds.comment.added": {
    title:
      "{{#if isMentionedInComment}}{{ sender.name }} mentioned you in a reply" +
      "{{else}}{{#if isActivityOwner}}{{ sender.name }} replied to your sparkle" +
      "{{else}}{{ sender.name }} replied to you{{/if}}{{/if}}",
    body: "{{ truncate comment.text 140 }}",
    kind: "comment",
    id: "{{ comment.id }}",
  },
  "feeds.activity.reaction.added": {
    title: "{{ sender.name }} liked your sparkle",
    body: "{{ truncate activity.text 140 }}",
    kind: "like",
    id: "{{ activity.id }}",
  },
  "feeds.comment.reaction.added": {
    title: "{{ sender.name }} liked your reply",
    body: "{{ truncate comment.text 140 }}",
    kind: "like",
    id: "{{ comment.id }}",
  },
  "feeds.follow.created": {
    title: "{{ sender.name }} followed you",
    kind: "follow",
    id: "{{ sender.id }}",
  },
  // The `user` group's push types leave out `post`, so this only fires for a mention.
  "feeds.activity.added": {
    title: "{{ sender.name }} mentioned you",
    body: "{{ truncate activity.text 140 }}",
    kind: "mention",
    id: "{{ activity.id }}",
  },
};

/** A group names itself in the title. A DM has no channel name, so it shows only the sender. */
export const CHAT_MESSAGE_COPY: PushWords = {
  title:
    "{{#if channel.name}}{{ sender.name }} in {{ channel.name }}{{else}}{{ sender.name }}{{/if}}",
  body: "{{#if message.text}}{{ truncate message.text 140 }}{{else}}Sent an attachment{{/if}}",
};

/**
 * Stream's default chat data, field for field. Builds already installed open the
 * messages list for `sender: "stream.chat"`, so a new field is fine but none may go.
 */
const CHAT_MESSAGE_DATA = {
  version: "v2",
  sender: "stream.chat",
  type: "{{ event_type }}",
  id: "{{ message.id }}",
  message_id: "{{ message.id }}",
  channel_type: "{{ channel.type }}",
  channel_id: "{{ channel.id }}",
  cid: "{{ channel.cid }}",
  receiver_id: "{{ receiver.id }}",
};

/** Everything that may push from the `user` group. No `post`: `/pushTokens/sparkle` announces those. */
export const USER_FEED_PUSH_TYPES = ["follow", "comment", "reaction", "comment_reaction", "mention"];

/** Android's channel, created by the mobile app's `push-registration.ts`. */
const ANDROID_CHANNEL = "default";

export function streamPushTemplate(
  event: StreamFeedsPushEvent,
  providerType: StreamPushProviderType,
): string {
  const { kind, id, ...words } = STREAM_PUSH_COPY[event];
  const data = { sender: "stream.feeds", kind, type: kind, id };

  if (providerType === "apn") return JSON.stringify({ aps: apsAlert(words), ...data });

  return firebaseTemplate(words, data);
}

export function chatMessagePushTemplate(): string {
  return firebaseTemplate(CHAT_MESSAGE_COPY, CHAT_MESSAGE_DATA);
}

/** One call to `upsertPushTemplate`. */
export interface PushTemplateUpsert {
  event_type:
    | StreamFeedsPushEvent
    | typeof CHAT_MESSAGE_PUSH_EVENT
    | typeof DISABLED_STREAM_PUSH_EVENT;
  push_provider_type: StreamPushProviderType;
  push_provider_name: string;
  enable_push: boolean;
  template?: string;
}

/**
 * Every template one provider needs.
 *
 * New messages used to have none, so Stream sent Android its data-only default
 * and no DM ever showed. iPhones keep Stream's APN default for them: it already
 * shows a banner, and it sets the unread badge, a bare number that a template
 * built as JSON can't write.
 */
export function pushTemplateUpserts({ type, name }: StreamPushProvider): PushTemplateUpsert[] {
  const upsert = (
    event_type: PushTemplateUpsert["event_type"],
    enable_push: boolean,
    template?: string,
  ): PushTemplateUpsert => ({
    event_type,
    push_provider_type: type,
    push_provider_name: name,
    enable_push,
    ...(template ? { template } : {}),
  });

  const feedEvents = Object.keys(STREAM_PUSH_COPY) as StreamFeedsPushEvent[];
  return [
    ...feedEvents.map((event) => upsert(event, true, streamPushTemplate(event, type))),
    upsert(CHAT_MESSAGE_PUSH_EVENT, true, type === "firebase" ? chatMessagePushTemplate() : undefined),
    upsert(DISABLED_STREAM_PUSH_EVENT, false),
  ];
}

function firebaseTemplate(words: PushWords, data: Record<string, string>): string {
  const banner = bannerOf(words);
  return JSON.stringify({
    data: { ...data, ...banner },
    android: {
      priority: "high",
      notification: { ...banner, channel_id: ANDROID_CHANNEL, sound: "default" },
    },
    apns: { payload: { aps: apsAlert(words), ...data } },
  });
}

function apsAlert(words: PushWords) {
  return { alert: bannerOf(words), sound: "default", "mutable-content": 1, "content-available": 0 };
}

function bannerOf({ title, body }: PushWords): PushWords {
  return { title, ...(body ? { body } : {}) };
}
