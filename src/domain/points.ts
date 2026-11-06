import { z } from "zod";

/**
 * What every interaction is worth, and how many times a day it can earn. This is
 * the one place to change either: clients read it through `GET /api/points/rules`
 * and only ever show what the server awarded.
 */
export const POINT_RULES = {
  sparkle: { points: 10, dailyCap: 10, label: "Post a sparkle" },
  quote: { points: 8, dailyCap: 10, label: "Quote a sparkle" },
  reply: { points: 5, dailyCap: 30, label: "Reply" },
  resparkle: { points: 3, dailyCap: 20, label: "Resparkle" },
  reply_resparkle: { points: 3, dailyCap: 20, label: "Resparkle a reply" },
  follow: { points: 2, dailyCap: 20, label: "Follow someone" },
  poll_vote: { points: 2, dailyCap: 20, label: "Vote in a poll" },
  like: { points: 1, dailyCap: 50, label: "Like a sparkle" },
  reply_like: { points: 1, dailyCap: 50, label: "Like a reply" },
  bookmark: { points: 1, dailyCap: 20, label: "Bookmark a sparkle" },
} as const;

export type PointAction = keyof typeof POINT_RULES;

export const POINT_ACTIONS = Object.keys(POINT_RULES) as [PointAction, ...PointAction[]];

export const pointClaimSchema = z.object({
  action: z.enum(POINT_ACTIONS),
  targetId: z.string().trim().min(1).max(200),
});

export type PointClaimOutcome = "awarded" | "already_claimed" | "daily_cap" | "not_verified";
