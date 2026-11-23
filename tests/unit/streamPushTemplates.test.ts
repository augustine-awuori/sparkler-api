import { describe, expect, it } from "vitest";

import {
  CHAT_MESSAGE_COPY,
  CHAT_MESSAGE_PUSH_EVENT,
  STREAM_PUSH_COPY,
  USER_FEED_PUSH_TYPES,
  chatMessagePushTemplate,
  pushTemplateUpserts,
  streamPushTemplate,
  type StreamFeedsPushEvent,
} from "../../src/services/streamPushTemplates.js";

const events = Object.keys(STREAM_PUSH_COPY) as StreamFeedsPushEvent[];

/** Every Firebase template the script saves, feeds and chat alike. */
const firebaseTemplates = [
  ...events.map((event) => [event, streamPushTemplate(event, "firebase")] as const),
  [CHAT_MESSAGE_PUSH_EVENT, chatMessagePushTemplate()] as const,
];

describe("streamPushTemplate", () => {
  it.each(events)("%s shows a banner on Android and iPhone", (event) => {
    const firebase = JSON.parse(streamPushTemplate(event, "firebase"));
    expect(firebase.android.notification.title).toBeTruthy();
    expect(firebase.android.notification.channel_id).toBe("default");
    expect(firebase.apns.payload.aps.alert.title).toBeTruthy();

    const apn = JSON.parse(streamPushTemplate(event, "apn"));
    expect(apn.aps.alert.title).toBeTruthy();
  });

  it.each(events)("%s carries what the apps route a tap on", (event) => {
    const { kind, id } = STREAM_PUSH_COPY[event];
    const firebase = JSON.parse(streamPushTemplate(event, "firebase"));
    const apn = JSON.parse(streamPushTemplate(event, "apn"));
    for (const data of [firebase.data, firebase.apns.payload, apn]) {
      expect(data).toMatchObject({ kind, type: kind, id });
    }
  });

  it("leaves new sparkles to the route that checks audience and anonymity", () => {
    expect(USER_FEED_PUSH_TYPES).not.toContain("post");
  });
});

describe("Firebase templates on the web", () => {
  // A browser shows a top-level `notification` by itself, and the service worker
  // then shows the push again from `onBackgroundMessage`.
  it.each(firebaseTemplates)("%s leaves the banner to the service worker", (_event, template) => {
    const firebase = JSON.parse(template);
    expect(firebase).not.toHaveProperty("notification");
    expect(firebase.data.title).toBe(firebase.android.notification.title);
    expect(firebase.data.body).toBe(firebase.android.notification.body);
  });
});

describe("chatMessagePushTemplate", () => {
  it("shows Android a banner with the sender and the message", () => {
    const { android } = JSON.parse(chatMessagePushTemplate());
    expect(android.priority).toBe("high");
    expect(android.notification).toEqual({
      ...CHAT_MESSAGE_COPY,
      channel_id: "default",
      sound: "default",
    });
    expect(CHAT_MESSAGE_COPY.title).toContain("{{ sender.name }}");
    expect(CHAT_MESSAGE_COPY.body).toContain("message.text");
  });

  // Installed builds open the messages list for `sender: "stream.chat"`.
  it("keeps every field of Stream's default chat data", () => {
    const { data } = JSON.parse(chatMessagePushTemplate());
    expect(data).toMatchObject({
      version: "v2",
      sender: "stream.chat",
      type: "{{ event_type }}",
      id: "{{ message.id }}",
      message_id: "{{ message.id }}",
      channel_type: "{{ channel.type }}",
      channel_id: "{{ channel.id }}",
      cid: "{{ channel.cid }}",
      receiver_id: "{{ receiver.id }}",
    });
  });
});

describe("pushTemplateUpserts", () => {
  const firebase = { type: "firebase", name: "sparkler_mobile" } as const;
  const apn = { type: "apn", name: "Chats_iOS" } as const;

  // Without one, Stream sent Android its data-only default and no DM showed.
  it("gives Android a template for new messages", () => {
    expect(pushTemplateUpserts(firebase)).toContainEqual({
      event_type: "message.new",
      push_provider_type: "firebase",
      push_provider_name: "sparkler_mobile",
      enable_push: true,
      template: chatMessagePushTemplate(),
    });
  });

  it("keeps Stream's own banner and badge for messages on iPhone", () => {
    expect(pushTemplateUpserts(apn)).toContainEqual({
      event_type: "message.new",
      push_provider_type: "apn",
      push_provider_name: "Chats_iOS",
      enable_push: true,
    });
  });

  it.each([firebase, apn])("turns on every feed event for $name", (provider) => {
    const upserts = pushTemplateUpserts(provider);
    for (const event of events) {
      expect(upserts).toContainEqual({
        event_type: event,
        push_provider_type: provider.type,
        push_provider_name: provider.name,
        enable_push: true,
        template: streamPushTemplate(event, provider.type),
      });
    }
    expect(upserts).toContainEqual(
      expect.objectContaining({ event_type: "feeds.notification_feed.updated", enable_push: false }),
    );
  });
});
