import * as stream from "getstream";

import { User } from "../models/user.js";

export function getClient() {
  return stream.connect(
    "8hn252eegqq9",
    "ugun3arzm2amrqpnsxvtpu3bvhebrg6dnrg6kybjvntctp922zx73c5b34zszbm3",
    "1322281"
  );
}

export function getTargetFeeds(actorId) {
  return [`notification:${actorId}`];
}

export async function addChildReaction({
  kind,
  parentId,
  data = {},
  targetFeeds,
  userId,
}) {
  try {
    const client = getClient();
    if (!client) return { ok: false, data: "Client not initialized" };

    const resData = await client.reactions.addChild(kind, parentId, data, {
      targetFeeds,
      userId,
    });

    return { ok: true, data: resData };
  } catch (error) {
    return { ok: false, data: error };
  }
}

export async function addReaction({
  kind,
  sparkleId,
  actorId,
  targetFeeds,
  userId,
  data = {},
}) {
  try {
    const client = getClient();
    if (!client) return { ok: false, data: "Client not initialized" };

    const resData = await client.reactions.add(
      kind,
      sparkleId,
      { id: actorId, ...data },
      { targetFeeds, userId }
    );
    return { ok: true, data: resData };
  } catch (error) {
    return { ok: false, data: error };
  }
}

export function getEATZone() {
  return new Date(new Date().getTime() + 3 * 60 * 60 * 1000).toISOString();
}

export async function getUserReactions({ kind, userId }) {
  try {
    const client = getClient();
    if (!client) return { ok: false, data: "Client not initialized" };

    const res = await client.reactions.filter({
      kind,
      with_activity_data: true,
      with_own_children: true,
      filter_user_id: userId,
      user_id: userId,
    });

    return {
      ok: !!res,
      data: res || "Something failed while fetching reactions",
    };
  } catch (error) {
    return { ok: false, data: error };
  }
}

export async function removeChildReaction(reactionId) {
  try {
    const client = getClient();
    if (!client) return { ok: false, data: "Client not initialized" };

    const response = await client.reactions.delete(reactionId);
    return { ok: true, data: response };
  } catch (error) {
    return { ok: false, data: error };
  }
}

export async function removeReaction({ sparkleId, kind, userId }) {
  try {
    const client = getClient();
    if (!client) return { ok: false, data: "Client not initialized" };

    const response = await client.reactions.filter({
      activity_id: sparkleId,
      kind,
      user_id: userId,
    });
    if (response.results.length === 0)
      return { ok: false, data: "Reaction not found" };

    const reactionId = response.results[0].id;
    await client.reactions.delete(reactionId);

    return { ok: true, data: response };
  } catch (error) {
    return { ok: false, data: error };
  }
}

export function getAuthCode() {
  return Math.floor(1000 + Math.random() * 9000);
}

export function getHashtags(text = "") {
  const hashtagPattern = /#(\w+)/g;
  let match;
  const hashtags = [];

  while ((match = hashtagPattern.exec(text)) !== null) {
    hashtags.push(match[1]);
  }

  return hashtags;
}

export function prepareHashtagTags(hashtags = [], user) {
  if (!hashtags.length || !user) return [];

  const computed = [
    ...hashtags.map((tag) => `hashtags:${tag.toLowerCase()}`),
    "hashtags:general",
  ];

  if (user.verified) computed.push("hashtags:verified");

  return computed;
}

export function prepareMentionsIdsTags(mentionsIds = []) {
  return mentionsIds.length
    ? mentionsIds.map((id) => `notification:${id}`)
    : [];
}

export async function getUserIds(usernames) {
  const users = await User.find({ username: { $in: usernames } });

  return users.map((user) => user._id.toString());
}

export function getMentions(text = "") {
  const mentionPattern = /@(\w+)/g;
  let match;
  const mentions = [];

  while ((match = mentionPattern.exec(text)) !== null) {
    mentions.push(match[1]);
  }

  return mentions;
}

export const createOrGetUser = (user) => {
  const client = getClient();

  if (!user || !client) return;

  const {
    _id,
    chatToken,
    feedToken,
    invalid,
    name,
    username,
    verified,
    email,
  } = user;
  const userId = _id.toString();
  return client?.user(userId)?.create(
    {
      id: userId,
      chatToken,
      feedToken,
      invalid,
      name,
      username,
      verified,
      email,
    },
    { get_or_create: true }
  );
};
