import { isDuplicateKey } from "../utils/isDuplicateKey.js";
import { POINT_RULES, type PointAction, type PointClaimOutcome } from "../domain/points.js";
import { PointEvent } from "../models/pointEvent.js";
import { Sparkler } from "../models/sparkler.js";
import type { Logger } from "../utils/logger.js";
import { POINT_VERIFIERS } from "./pointVerifiers.js";
import { findSparklerById } from "./users.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface PointClaimResult {
  outcome: PointClaimOutcome;
  awarded: number;
  total: number;
}


async function currentTotal(userId: string): Promise<number> {
  return (await findSparklerById(userId))?.points ?? 0;
}

async function verified(userId: string, action: PointAction, targetId: string, log: Logger) {
  try {
    return await POINT_VERIFIERS[action](userId, targetId);
  } catch (err) {
    // Not found, or Stream is down. Either way nothing proves it, so nothing is
    // awarded, and the ledger stays open for a retry.
    log.warn({ err, action }, "Could not verify a points claim");
    return false;
  }
}

/**
 * Awards points for something the caller says they did, once Stream agrees.
 *
 * The cheap checks go first, so a repeat claim never costs a Stream call. The
 * insert is what decides a race: two claims at once both get past the checks,
 * and the unique index lets only one of them earn.
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

  if (!(await verified(userId, action, targetId, log))) return nothing("not_verified");

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
