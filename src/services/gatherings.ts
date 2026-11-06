import type { Model, Types } from "mongoose";
import type { z } from "zod";

import { ForbiddenError, NotFoundError, TooManyRequestsError } from "../domain/errors.js";
import {
  communitySlug,
  isObjectId,
  type newCommunitySchema,
  type newEventSchema,
} from "../domain/gathering.types.js";
import { CampusEvent, EventRsvp, type CampusEventDoc } from "../models/campusEvent.js";
import { Community, CommunityMember, type CommunityDoc } from "../models/community.js";
import { isDuplicateKey } from "../utils/isDuplicateKey.js";
import { findSparklerById } from "./users.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_COMMUNITIES_PER_DAY = 3;
const MAX_EVENTS_PER_DAY = 5;
const LIST_LIMIT = 100;

/** Only their maker or an admin takes one down, so nobody can empty someone else's. */
async function assertCanRemove(createdBy: string, userId: string): Promise<void> {
  if (createdBy === userId) return;
  const viewer = await findSparklerById(userId);
  if (!viewer?.custom?.isAdmin) throw new ForbiddenError("Only its creator can remove this");
}

/**
 * Someone's place in a community or at an event. The unique index on the join
 * table decides whether anything changed, so the count can't drift when two
 * requests race.
 */
class Attendance<Link> {
  constructor(
    private readonly links: Model<Link>,
    private readonly owners: Model<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
    private readonly linkKey: keyof Link & string,
    private readonly countField: string,
  ) {}

  async add(ownerId: Types.ObjectId | string, userId: string): Promise<void> {
    const key = String(ownerId);
    try {
      await this.links.create({ [this.linkKey]: key, userId } as never);
    } catch (error) {
      if (isDuplicateKey(error)) return;
      throw error;
    }
    await this.owners.updateOne({ _id: ownerId }, { $inc: { [this.countField]: 1 } });
  }

  async remove(ownerId: Types.ObjectId | string, userId: string): Promise<void> {
    const { deletedCount } = await this.links.deleteOne({
      [this.linkKey]: String(ownerId),
      userId,
    } as never);
    if (deletedCount) {
      await this.owners.updateOne({ _id: ownerId }, { $inc: { [this.countField]: -1 } });
    }
  }

  async idsFor(userId: string): Promise<Set<string>> {
    const held = await this.links.find({ userId } as never, { [this.linkKey]: 1 }).lean();
    return new Set(held.map((link) => String((link as Record<string, unknown>)[this.linkKey])));
  }

  async dropEveryoneFrom(ownerId: Types.ObjectId | string): Promise<void> {
    await this.links.deleteMany({ [this.linkKey]: String(ownerId) } as never);
  }

  /** For when an account goes: each of theirs comes off its count. */
  async removeUserEverywhere(userId: string): Promise<void> {
    const ids = [...(await this.idsFor(userId))];
    await this.links.deleteMany({ userId } as never);
    if (ids.length) {
      await this.owners.updateMany({ _id: { $in: ids } }, { $inc: { [this.countField]: -1 } });
    }
  }
}

const communityMembers = new Attendance(CommunityMember, Community, "communityId", "memberCount");
const eventRsvps = new Attendance(EventRsvp, CampusEvent, "eventId", "goingCount");

function toCommunityView(community: CommunityDoc, joined: ReadonlySet<string>) {
  return {
    id: community._id.toString(),
    slug: community.slug,
    name: community.name,
    description: community.description,
    school: community.school ?? null,
    createdBy: community.createdBy,
    memberCount: community.memberCount,
    joined: joined.has(community._id.toString()),
  };
}

async function communityOr404(slug: string): Promise<CommunityDoc> {
  const community = await Community.findOne({ slug });
  if (!community) throw new NotFoundError("That community doesn't exist");
  return community;
}

export async function listCommunities(
  userId: string,
  { school, mine }: { school?: string; mine?: string },
) {
  const joined = await communityMembers.idsFor(userId);
  const communities = await Community.find({
    ...(school && { school }),
    ...(mine && { _id: { $in: [...joined] } }),
  })
    .sort({ memberCount: -1, _id: -1 })
    .limit(LIST_LIMIT);
  return communities.map((community) => toCommunityView(community, joined));
}

export async function readCommunity(slug: string, userId: string) {
  const community = await communityOr404(slug);
  return toCommunityView(community, await communityMembers.idsFor(userId));
}

export async function createCommunity(
  userId: string,
  fields: z.infer<typeof newCommunitySchema>,
) {
  const recent = await Community.countDocuments({
    createdBy: userId,
    createdAt: { $gte: new Date(Date.now() - DAY_MS) },
  });
  if (recent >= MAX_COMMUNITIES_PER_DAY) {
    throw new TooManyRequestsError("You've started a lot of communities today. Try again tomorrow.");
  }
  const community = await Community.create({
    ...fields,
    slug: communitySlug(fields.name),
    createdBy: userId,
  });
  await communityMembers.add(community._id, userId);
  return readCommunity(community.slug, userId);
}

export async function joinCommunity(slug: string, userId: string) {
  await communityMembers.add((await communityOr404(slug))._id, userId);
  return readCommunity(slug, userId);
}

export async function leaveCommunity(slug: string, userId: string) {
  await communityMembers.remove((await communityOr404(slug))._id, userId);
  return readCommunity(slug, userId);
}

export async function removeCommunity(slug: string, userId: string): Promise<void> {
  const community = await communityOr404(slug);
  await assertCanRemove(community.createdBy, userId);
  await communityMembers.dropEveryoneFrom(community._id);
  await community.deleteOne();
}

function toEventView(event: CampusEventDoc, going: ReadonlySet<string>) {
  return {
    id: event._id.toString(),
    title: event.title,
    description: event.description,
    place: event.place,
    startsAt: event.startsAt,
    endsAt: event.endsAt ?? null,
    school: event.school ?? null,
    community: event.community ?? null,
    createdBy: event.createdBy,
    goingCount: event.goingCount,
    going: going.has(event._id.toString()),
  };
}

async function eventOr404(id: string): Promise<CampusEventDoc> {
  const event = isObjectId(id) ? await CampusEvent.findById(id) : null;
  if (!event) throw new NotFoundError("That event doesn't exist");
  return event;
}

/** Soonest first, and only what hasn't finished. */
export async function listEvents(
  userId: string,
  { school, community }: { school?: string; community?: string },
) {
  const now = new Date();
  const going = await eventRsvps.idsFor(userId);
  const events = await CampusEvent.find({
    $or: [{ endsAt: { $gte: now } }, { endsAt: null, startsAt: { $gte: new Date(now.getTime() - DAY_MS / 4) } }],
    ...(school && { school }),
    ...(community && { community }),
  })
    .sort({ startsAt: 1 })
    .limit(LIST_LIMIT);
  return events.map((event) => toEventView(event, going));
}

export async function createEvent(userId: string, fields: z.infer<typeof newEventSchema>) {
  const recent = await CampusEvent.countDocuments({
    createdBy: userId,
    _id: { $gte: objectIdSince(Date.now() - DAY_MS) },
  });
  if (recent >= MAX_EVENTS_PER_DAY) {
    throw new TooManyRequestsError("You've added a lot of events today. Try again tomorrow.");
  }
  const event = await CampusEvent.create({ ...fields, createdBy: userId });
  await eventRsvps.add(event._id, userId);
  return readEvent(event._id.toString(), userId);
}

/** Events carry no timestamps, and an ObjectId already starts with one. */
function objectIdSince(ms: number): string {
  return `${Math.floor(ms / 1000).toString(16).padStart(8, "0")}0000000000000000`;
}

async function readEvent(id: string, userId: string) {
  return toEventView(await eventOr404(id), await eventRsvps.idsFor(userId));
}

export async function goToEvent(id: string, userId: string) {
  await eventRsvps.add((await eventOr404(id))._id, userId);
  return readEvent(id, userId);
}

export async function skipEvent(id: string, userId: string) {
  await eventRsvps.remove((await eventOr404(id))._id, userId);
  return readEvent(id, userId);
}

export async function removeEvent(id: string, userId: string): Promise<void> {
  const event = await eventOr404(id);
  await assertCanRemove(event.createdBy, userId);
  await eventRsvps.dropEveryoneFrom(event._id);
  await event.deleteOne();
}

export async function forgetGatheringsOf(userId: string): Promise<void> {
  await communityMembers.removeUserEverywhere(userId);
  await eventRsvps.removeUserEverywhere(userId);
}
