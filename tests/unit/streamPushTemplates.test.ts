import { describe, expect, it } from "vitest";

import {
  STREAM_PUSH_COPY,
  USER_FEED_PUSH_TYPES,
  streamPushTemplate,
  type StreamPushEvent,
} from "../../src/services/streamPushTemplates.js";

const events = Object.keys(STREAM_PUSH_COPY) as StreamPushEvent[];

describe("streamPushTemplate", () => {
  it.each(events)("%s shows a banner on Android and iPhone", (event) => {
    const firebase = JSON.parse(streamPushTemplate(event, "firebase"));
    expect(firebase.notification.title).toBeTruthy();
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
