import { isValidObjectId } from "mongoose";

import { ForbiddenError, NotFoundError } from "../domain/errors.js";
import type { SparklerFlag } from "../domain/sparklerFlags.js";
import { Sparkler, type SparklerDoc } from "../models/sparkler.js";
import { verifiedMail } from "./accountMail.js";
import { revokeDeveloperAccess } from "./developers.js";
import type { MailInput } from "./mail.js";

/** Side effects of a change, injected so the route decides how failures are logged. */
export interface FlagChangeEffects {
  syncToStream(doc: SparklerDoc): Promise<unknown>;
  mail(mails: readonly MailInput[]): void;
}

/** An admin verifying someone, or granting or taking away admin, by user id. */
export class SparklerFlags {
  constructor(private readonly effects: FlagChangeEffects) {}

  async setVerified(targetId: string, verified: boolean): Promise<SparklerDoc> {
    const { wasSet, after } = await this.set(targetId, "verified", verified);
    // Only on the first verification, so toggling back and forth mails no one twice.
    if (verified && !wasSet) this.effects.mail([verifiedMail(after)]);
    return after;
  }

  async setAdmin(actorId: string, targetId: string, isAdmin: boolean): Promise<SparklerDoc> {
    // Stops the last admin locking everyone out by demoting themselves.
    if (actorId === targetId) throw new ForbiddenError("You can't change your own access");

    const { after } = await this.set(targetId, "isAdmin", isAdmin);
    if (!isAdmin) await revokeDeveloperAccess(targetId);
    return after;
  }

  private async set(
    targetId: string,
    flag: SparklerFlag,
    value: boolean,
  ): Promise<{ wasSet: boolean; after: SparklerDoc }> {
    if (!isValidObjectId(targetId)) throw new NotFoundError("User does not exist in the database");

    // Dotted path: a partial `custom` would replace the whole object.
    const before = await Sparkler.findByIdAndUpdate(targetId, { $set: { [`custom.${flag}`]: value } });
    if (!before) throw new NotFoundError("User does not exist in the database");

    const after = await Sparkler.findById(targetId).orFail();
    await this.effects.syncToStream(after);
    return { wasSet: before.custom?.[flag] === true, after };
  }
}
