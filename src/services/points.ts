import { isDuplicateKey } from "../utils/isDuplicateKey.js";
import { POINT_RULES, type PointAction, type PointClaimOutcome } from "../domain/points.js";
import { PointEvent } from "../models/pointEvent.js";
import { Sparkler } from "../models/sparkler.js";
import type { Logger } from "../utils/logger.js";
import { POINT_VERIFIERS } from "./pointVerifiers.js";
import { isStreamRefusal } from "./stream.js";
import { findSparklerById } from "./users.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PointClaimResult {
  outcome: PointClaimOutcome;
  awarded: number;
  total: number;
}

/** What Stream said about a claim, or that it couldn't be asked. */
type Verdict = "verified" | "not_verified" | "try_later";

async function currentTotal(userId: string): Promise<number> {
  return (await findSparklerById(userId))?.points ?? 0;
}

async function verify(
  userId: string,
  action: PointAction,
  targetId: string,
  log: Logger,
): Promise<Verdict> {
  try {
    return (await POINT_VERIFIERS[action](userId, targetId)) ? "verified" : "not_verified";
  } catch (err) {
    // Stream saying the thing isn't there settles it. Stream not answering
    // settles nothing: answering `not_verified` then cost people their points.
    if (isStreamRefusal(err)) return "not_verified";
    log.warn({ err, action }, "Could not verify a points claim");
    return "try_later";
  }
}

/**
 * Awards points for something the caller says they did, once Stream agrees.
 *
 * The cheap checks go first, so a repeat claim never costs a Stream call. The
 * insert is what decides a race: two claims at once both get past the checks,
 * and the unique index lets only one of them earn. When Stream can't be asked,
 * nothing is written, and the apps keep the claim and send it again.
 */
export async function claimPoints(
  userId: string,
  action: PointAction,
  targetId: string,
  log: Logger,
): Promise<PointClaimResult> {
  const nothing = async (outcome: PointClaimOutcome): Promise<PointClaimResult> => ({
    outcome,
    awarded: 0,
    total: await currentTotal(userId),
  });

  if (await PointEvent.exists({ userId, action, targetId })) return nothing("already_claimed");

  const { points, dailyCap } = POINT_RULES[action];
  const earnedToday = await PointEvent.countDocuments({
    userId,
    action,
    createdAt: { $gte: new Date(Date.now() - DAY_MS) },
  });
  if (earnedToday >= dailyCap) return nothing("daily_cap");

  const verdict = await verify(userId, action, targetId, log);
  if (verdict !== "verified") return nothing(verdict);

  try {
    await PointEvent.create({ userId, action, targetId, points });
  } catch (error) {
    if (isDuplicateKey(error)) return nothing("already_claimed");
    throw error;
  }

  const user = await Sparkler.findByIdAndUpdate(
    userId,
    { $inc: { points } },
    { returnDocument: "after" },
  );
  return { outcome: "awarded", awarded: points, total: user?.points ?? points };
}
