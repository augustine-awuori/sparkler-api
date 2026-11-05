/**
 * What Stream's own pushes say, and where tapping one goes.
 * https://getstream.io/activity-feeds/docs/node/push-template/
 *
 * `data` carries the fields both apps already route on (`kind`, `type`, `id`), so
 * a Stream push opens the same screens as one sent through Expo. A status id can
 * be a sparkle or a reply: that screen works out which.
 *
 * Unlike Stream's defaults, the Firebase form has a `notification` block. The
 * defaults send data only, for apps that draw the banner themselves, which ours
 * don't. Resparkles, quotes and anonymous replies set `skip_push` and go through
 * our own route, because the docs don't confirm a template can branch on a
 * reaction's type or see custom fields.
 */

export type StreamPushEvent =
  | "feeds.comment.added"
  | "feeds.activity.reaction.added"
  | "feeds.comment.reaction.added"
  | "feeds.follow.created"
  | "feeds.activity.added";

export type StreamPushProviderType = "firebase" | "apn";

interface PushCopy {
  title: string;
  body?: string;
  kind: string;
  id: string;
}

export const STREAM_PUSH_COPY: Record<StreamPushEvent, PushCopy> = {
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

/** Sent by the notification feed as well, and Stream's direct event already covers each action. */
export const DISABLED_STREAM_PUSH_EVENT = "feeds.notification_feed.updated";

/** Everything that may push from the `user` group. No `post`: `/pushTokens/sparkle` announces those. */
export const USER_FEED_PUSH_TYPES = ["follow", "comment", "reaction", "comment_reaction", "mention"];

/** Android's channel, created by the mobile app's `push-registration.ts`. */
const ANDROID_CHANNEL = "default";

export function streamPushTemplate(
  event: StreamPushEvent,
  providerType: StreamPushProviderType,
): string {
  const { title, body, kind, id } = STREAM_PUSH_COPY[event];
  const data = { sender: "stream.feeds", kind, type: kind, id };
  const aps = {
    alert: { title, ...(body ? { body } : {}) },
    sound: "default",
    "mutable-content": 1,
    "content-available": 0,
  };

  if (providerType === "apn") return JSON.stringify({ aps, ...data });

  return JSON.stringify({
    notification: { title, ...(body ? { body } : {}) },
    data,
    android: { priority: "high", notification: { channel_id: ANDROID_CHANNEL, sound: "default" } },
    apns: { payload: { aps, ...data } },
  });
}
