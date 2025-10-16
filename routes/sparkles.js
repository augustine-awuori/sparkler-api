import express from "express";
import { nanoid } from "nanoid";

import {
  createOrGetUser,
  getClient,
  getEATZone,
  getHashtags,
  getMentions,
  getTargetFeeds,
  getUserIds,
  prepareHashtagTags,
  prepareMentionsIdsTags,
} from "../utils/func.js";
import { Community } from "../models/community.js";
import { notifyCommunityMembers } from "../utils/communities.js";
import { saveBug } from "./bugs.js";
import { sendPushNotificationTo } from "./expoPushNotifications.js";
import { Sparkle } from "../models/sparkle.js";
import { User } from "../models/user.js";
import auth from "../middlewares/auth.js";
import politeAuth from "../middlewares/politeAuth.js";

const router = express.Router();
const SPARKLE_VERB = "sparkle";

router.post("/", auth, async (req, res) => {
  try {
    await createOrGetUser(req.user);

    const sparkle = await postSparkle(req.user, req.body);

    if (sparkle) {
      new Sparkle({ ...sparkle }).save();
      return res.send(sparkle);
    }

    await saveBug(`Sparkle is falsy, couldn't create it: ${sparkle}`);
    res.status(500).send({ error: "Couldn't create the sparkle" });
  } catch (error) {
    saveBug(`Error catched while creating a sparkle ${error}`);
    res.status(500).send({ error: "Error creating a sparkle" });
  }
});

router.patch("/:sparkleId", auth, async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      saveBug(`Error initializing client while trying to edit a sparkle`);
      return res.status(500).send({ error: `Error initializing a client` });
    }

    const { text, collectionId } = req.body;
    client.collections.update(SPARKLE_VERB, collectionId, { text });
    const userFeed = client.feed("user", req.user._id.toString());
    const updatedActivity = await userFeed?.updateActivity({
      id: req.params.sparkleId,
      text,
    });
    res.send(updatedActivity);
  } catch (error) {
    res.status(500).send({ error: "Error editing a sparkle" });
  }
});

router.post("/quote", auth, async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      saveBug(`Error initializing a client while quoting a sparkle`);
      return res.status(500).send({ error: `Error initializing a client` });
    }

    await createOrGetUser(req.user);

    const userId = req.user._id.toString();
    const { images, text, quoted_activity } = req.body;
    const actorId = quoted_activity.actor.id;
    const notifyActor = userId !== actorId;
    const verb = "quote";

    await client.reactions.add(
      verb,
      quoted_activity.id,
      { id: userId, text, images },
      { targetFeeds: notifyActor ? getTargetFeeds(actorId) : [], userId }
    );

    const collection = await client.collections.add(verb, nanoid(), {
      text,
    });

    const time = getEATZone();
    const userFeed = client.feed("user", userId);
    const mentionsIdsTags = prepareMentionsIdsTags(
      getUserIds(getMentions(text))
    );
    const hashtagTags = prepareHashtagTags(getHashtags(text), req.user);

    const quote = await userFeed?.addActivity({
      actor: `SU:${userId}`,
      attachments: { images },
      foreign_id: userId + time,
      object: `SO:${verb}:${collection.id}`,
      quoted_activity,
      target: notifyActor ? `notification:${actorId}` : `user:${userId}`,
      time,
      to: [...mentionsIdsTags, ...hashtagTags],
      moderation_template: "sparkle-moderation",
      verb,
      text,
      images,
    });

    if (quote) return res.send(quote);

    saveBug(`Quote is falsy, couldn't create it: ${quote}`);
    res.status(500).send({ error: "Couldn't quoting the sparkle" });
  } catch (error) {
    saveBug(`Error catched while creating quoting a sparkle ${error}`);
    res.status(500).send({ error: "Error quoting a sparkle" });
  }
});

router.post("/get-sparkles-of-ids", async (req, res) => {
  try {
    const { sparklesId } = req.body;

    const client = getClient();
    if (!client) {
      saveBug(`Error getting sparkles of ids, client is falsy`);
      return res.status(500).send({ error: `Error initializing a client` });
    }

    const sparkles = await client.getActivities({
      ids: sparklesId,
      enrich: true,
      ownReactions: true,
      reactions: true,
      withOwnChildren: true,
      withOwnReactions: true,
      withUserId: true,
      withReactionCounts: true,
      withRecentReactions: true,
    });

    if (sparkles) return res.send(sparkles.results);

    saveBug(`Sparkles are falsy, couldn't retrieve them: ${sparkles}`);
    res.status(500).send({ error: "Something failed getting sparkles" });
  } catch (error) {
    saveBug(`Error catched while retrieving quotes ${error}`);
    res.status(500).send({ error: "Error getting sparkles" });
  }
});

router.delete("/:sparkleId", auth, async (req, res) => {
  try {
    const { sparkleId } = req.params;

    const client = getClient();
    if (!client) {
      saveBug(`Error initializing client while trying to delete sparkles`);
      return res.status(500).send({ error: `Error initializing a client` });
    }

    const userFeed = client.feed("user", req.user._id.toString());
    res.send(await userFeed?.removeActivity(sparkleId));
  } catch (error) {
    saveBug(`Error catched while deleting sparkles ${error}`);
    res.status(500).send({ error: "Error deleting a sparkle" });
  }
});

router.get("/timeline", politeAuth, async (req, res) => {
  try {
    const client = getClient();
    if (!client) {
      saveBug(`Error initializing client while getting timeline`);
      return res.status(500).send({ error: `Error initializing a client` });
    }

    const userId =
      req?.user?._id?.toString() ||
      (await User.findOne({ username: "awuori" }))._id.toString();

    if (!userId)
      return res
        .status(400)
        .send({ error: "App Error! Could not fetch your timeline" });

    const userFeed = client.feed("timeline", userId);
    const timeline = await userFeed.get({
      enrich: true,
      ownReactions: true,
      reactions: true,
      withOwnChildren: true,
      withOwnReactions: true,
      withUserId: true,
      withReactionCounts: true,
      withRecentReactions: true,
    });

    if (timeline) return res.send(timeline.results);

    saveBug(`Timeline is falsy, couldn't retrieve it: ${timeline}`);
    res.status(500).send({ error: "Something failed getting timeline" });
  } catch (error) {
    saveBug(`Error catched while retrieving timeline ${error}`);
    res.status(500).send({ error: "Error getting timeline" });
  }
});

export async function postSparkle(
  user,
  { text = "", communities = [], images = [] }
) {
  try {
    const client = getClient();
    const userId = user._id.toString();

    if (!userId || !client) {
      if (!client) saveBug("Client is falsy while posting a sparkle");
      return;
    }

    const forCommunity = communities.length > 0;
    const collection = await client.collections.add(SPARKLE_VERB, nanoid(), {
      text,
      forCommunity,
      community: forCommunity ? communities[0] : "",
    });
    const time = getEATZone();
    const mentionsUserIds = await getUserIds(getMentions(text));
    let followersTimeline = getMentionFollowersTimeline(
      mentionsUserIds,
      client
    );
    const mentionsIdsTags = prepareMentionsIdsTags(mentionsUserIds);
    const hashtagTags = prepareHashtagTags(getHashtags(text), user);
    const parsedCommunities = communities
      .map((communityId) =>
        communityId ? `communities:${communityId}` : undefined
      )
      .filter((tag) => typeof tag === "string");
    const communityMembersTimeline = await getCommunityMembersTimeline(
      communities[0]
    );

    const sparkleData = {
      actor: `SU:${userId}`,
      verb: SPARKLE_VERB,
      attachments: { images },
      object: `SO:${SPARKLE_VERB}:${collection.id}`,
      foreign_id: userId + time,
      target: `timeline:${userId}`,
      time,
      text,
      images,
      to: [
        ...mentionsIdsTags,
        ...hashtagTags,
        ...parsedCommunities,
        ...followersTimeline,
        ...communityMembersTimeline,
      ],
      moderation_template: "sparkle-moderation",
    };
    const sparkle = await client.feed("user", userId).addActivity(sparkleData);
    new Sparkle({ ...sparkleData }).save();

    if (sparkle) {
      if (forCommunity)
        await notifyCommunityMembers(communities[0], userId, {
          message: text || "",
          title: `${user.name} sparkled in your community`,
        });
      sendPushNotificationTo(mentionsUserIds, {
        message: text || "",
        title: `${user.name} mentioned you`,
      });
      return sparkle;
    }
  } catch (error) {
    console.error("error creating sparkle", error);
  }
}

export default router;

function getMentionFollowersTimeline(mentionsUserIds, client) {
  let followersTimeline = [];

  mentionsUserIds.forEach(async (id) => {
    const response = await client.feed("user", id).followers();

    const mentionFollowers = (response?.results || []).map(
      (follower) => follower.feed_id
    );

    followersTimeline = [...followersTimeline, ...mentionFollowers];
  });

  return followersTimeline;
}

function getCommunityMembersTimeline(communityId) {
  if (!communityId) return [];

  return Community.findById(communityId)
    .then((community) => {
      if (!community) return [];
      return community.members.map((member) => `timeline:${member}`);
    })
    .catch(() => []);
}
