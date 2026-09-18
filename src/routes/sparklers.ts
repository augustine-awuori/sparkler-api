import { Router, type Response } from "express";

import { ConflictError, ForbiddenError, NotFoundError } from "../domain/errors.js";
import type { StreamSourceDoc } from "../domain/stream.types.js";
import { authedHandler, handler, type AuthedRequest } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { requireAdmin } from "../http/middlewares/requireAdmin.js";
import { legacyText, withAuthToken } from "../http/respond.js";
import { PushToken } from "../models/pushToken.js";
import { Sparkler } from "../models/sparkler.js";
import {
  accountDeletedMail,
  sendInBackground,
  verifiedMail,
  welcomeMail,
} from "../services/accountMail.js";
import { issueAuthToken } from "../services/authToken.js";
import { streamClient } from "../services/stream.js";
import {
  findSparklerById,
  findUniqueUsername,
  isUsernameTaken,
  pickProfile,
  toDirectoryUser,
  toStreamUser,
} from "../services/users.js";
import type { Logger } from "../utils/logger.js";

type Params = Record<string, string>;

interface SignInBody {
  email?: unknown;
  name?: unknown;
  image?: unknown;
}

interface ProfileBody {
  name?: unknown;
  image?: unknown;
  custom?: Record<string, unknown> | null;
}

const router = Router();

// Mongo is the source of truth; a Stream outage must never fail a sign-in.
// PATCH /sync reconciles anything that drifts while Stream is unavailable.
async function syncToStream(log: Logger, doc: StreamSourceDoc): Promise<boolean> {
  try {
    await streamClient().upsertUsers([toStreamUser(doc)]);
    return true;
  } catch (err) {
    log.error({ err, userId: doc._id.toString() }, "Stream upsert failed");
    return false;
  }
}

/** Sign-in responses carry the JWT as a bare text/html body AND in x-auth-token. */
function sendAuthToken(res: Response, sparkler: StreamSourceDoc): void {
  const token = issueAuthToken(sparkler);
  legacyText(withAuthToken(res, token), token);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const trimmedString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === 11000;

/**
 * The Sparkler for `email`, created if there is none. `created` is true only
 * for the request that actually inserted it: when two first sign-ins race, the
 * loser hits the unique email index and signs into the winner's account.
 */
async function findOrCreateSparkler(email: string, name: string, image: string) {
  const existing = await Sparkler.findOne({ email });
  if (existing) return { sparkler: existing, created: false };

  const username = await findUniqueUsername(name);
  try {
    const sparkler = await new Sparkler({ email, name, image, custom: { username } }).save();
    return { sparkler, created: true };
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const winner = await Sparkler.findOne({ email });
    if (!winner) throw error;
    return { sparkler: winner, created: false };
  }
}

// The one sign-in path both clients use: they authenticate with Firebase, then
// exchange the identity here. Finds the Sparkler by email or creates it.
router.post(
  "/quick",
  handler<Params, SignInBody>(async (req, res) => {
    try {
      // Strings only: an object here would reach Mongo as a query operator
      // (`{ "$ne": null }` would sign in as the first user in the database).
      const email = trimmedString(req.body?.email);
      const name = trimmedString(req.body?.name);
      const image = trimmedString(req.body?.image);

      if (!email || !name)
        return res.status(400).send({ error: "Name and email are required" });

      const { sparkler, created } = await findOrCreateSparkler(email, name, image);
      if (created) sendInBackground(req.log, [welcomeMail(sparkler)]);

      await syncToStream(req.log, sparkler);

      sendAuthToken(res, sparkler);
    } catch (error) {
      req.log.error({ err: error }, "Error with quick sign-in");
      res.status(500).send({ error: `Error with quick sign-in ${String(error)}` });
    }
  }),
);

// The directory. Public: both clients load it before (and without) sending a
// token, so the projection carries no email and no credential.
router.get(
  "/",
  handler(async (_req, res) => {
    const sparklers = await Sparkler.find({}).lean();

    res.send(sparklers.map(toDirectoryUser));
  }),
);

router.patch(
  "/verify",
  auth,
  requireAdmin,
  handler<Params, { emails?: unknown }>(async (req, res) => {
    try {
      const { emails = [] } = req.body;

      if (!Array.isArray(emails) || emails.length === 0)
        return res.status(400).json({ error: "Provide a non-empty array of emails" });

      // Only users not verified before this call get the email, so re-running
      // the same list does not mail anyone twice.
      const newlyVerified = await Sparkler.find(
        { email: { $in: emails }, "custom.verified": { $ne: true } },
        { email: 1, name: 1 },
      ).lean();

      const updateResult = await Sparkler.updateMany(
        { email: { $in: emails } },
        { $set: { "custom.verified": true } },
      );

      if (updateResult.matchedCount === 0)
        return res.status(404).json({ message: "No users found with these emails" });

      const updatedUsers = await Sparkler.find(
        { email: { $in: emails } },
        { _id: 1, name: 1, image: 1, email: 1, custom: 1 },
      ).lean();

      const usersToUpsert = updatedUsers.map(toStreamUser);

      sendInBackground(req.log, newlyVerified.map(verifiedMail));

      // The users are verified in Mongo either way; PATCH /sync repairs Stream.
      let upsertedInStream = 0;
      try {
        if (usersToUpsert.length > 0) await streamClient().upsertUsers(usersToUpsert);
        upsertedInStream = usersToUpsert.length;
        req.log.info(`Upserted ${upsertedInStream} users in Stream`);
      } catch (err) {
        req.log.error({ err }, "Stream upsert failed during bulk verify");
      }

      res.json({
        message: "Users verified successfully",
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount,
        upsertedInStream,
      });
    } catch (error) {
      req.log.error({ err: error }, "Error during bulk verify");
      res.status(500).json({ error: "Failed to verify users", details: errorText(error) });
    }
  }),
);

router.patch(
  "/sync",
  auth,
  requireAdmin,
  handler(async (req, res) => {
    try {
      const sparklers = (await Sparkler.find({}).lean()).map(toStreamUser);

      if (sparklers.length === 0)
        return res.status(200).json({ message: "No users to sync", updated: 0 });

      const BATCH_SIZE = 100;
      let totalUpdated = 0;

      // A failed batch is logged and skipped; the remaining batches still run.
      for (let i = 0; i < sparklers.length; i += BATCH_SIZE) {
        const batch = sparklers.slice(i, i + BATCH_SIZE);
        const batchNumber = i / BATCH_SIZE + 1;

        try {
          await streamClient().upsertUsers(batch);
          totalUpdated += batch.length;
          req.log.info(`Batch ${batchNumber} successful - ${batch.length} users`);
        } catch (err) {
          req.log.error({ err }, `Batch ${batchNumber} failed`);
        }
      }

      res.status(200).json({
        message: "User sync completed",
        totalUsers: sparklers.length,
        processed: totalUpdated,
      });
    } catch (error) {
      req.log.error({ err: error }, "Error during user sync");
      res.status(500).json({ error: "Error syncing user information", details: errorText(error) });
    }
  }),
);

/**
 * Updates the caller's own profile. Only `name`, `image`, `custom.username` and
 * the PROFILE_STRING_FIELDS / isProfilePrivate keys are written, each as a
 * dotted path so sibling `custom` keys survive. Everything else in the body is
 * ignored — mobile sends back its whole stored `custom`, and forwarding it
 * would let anyone set `isAdmin` or `verified` on themselves.
 */
async function updateOwnProfile(req: AuthedRequest<Params, ProfileBody>, res: Response) {
  const { name, image, custom } = req.body ?? {};
  const username = typeof custom?.username === "string" ? custom.username.trim() : undefined;

  const $set: Record<string, unknown> = {
    ...(typeof name === "string" && { name }),
    ...(typeof image === "string" && { image }),
    ...(username && { "custom.username": username }),
  };
  for (const [key, value] of Object.entries(pickProfile(custom))) $set[`custom.${key}`] = value;

  if (!Object.keys($set).length)
    return res.status(400).send({ error: "No updatable fields provided" });

  if (username && (await isUsernameTaken(username, req.user.id)))
    throw new ConflictError("That username is already taken");

  const user = await Sparkler.findByIdAndUpdate(
    req.user.id,
    { $set },
    { returnDocument: "after", runValidators: true },
  );
  if (!user) return res.status(404).send({ error: "User does not exist in the database" });

  // A Stream failure is logged; the update itself already succeeded.
  await syncToStream(req.log, user);

  // Reissued so the client's cached claims (username) match the new profile.
  sendAuthToken(res, user);
}

router.patch("/", auth, authedHandler<Params, ProfileBody>(updateOwnProfile));

// Deletes the caller's own account: the Sparkler, their push tokens, and their
// Stream user. Stream is best-effort — Mongo is the source of truth.
router.delete(
  "/",
  auth,
  authedHandler(async (req, res) => {
    const user = await Sparkler.findByIdAndDelete(req.user.id);
    if (!user) throw new NotFoundError("User does not exist in the database");

    await PushToken.deleteMany({ userId: user._id });
    sendInBackground(req.log, [accountDeletedMail(user)]);

    try {
      await streamClient().deleteUsers({ user_ids: [user._id.toString()], user: "hard" });
    } catch (err) {
      req.log.error({ err, userId: user._id.toString() }, "Stream user delete failed");
    }

    res.send({ success: true });
  }),
);

// Declared after every fixed path (/verify, /sync) so those never match `:id`.
router.get(
  "/:id",
  handler<{ id: string }>(async (req, res) => {
    const user = await findSparklerById(req.params.id);
    if (!user) throw new NotFoundError("User does not exist in the database");

    res.send(toDirectoryUser(user));
  }),
);

// The web client addresses its own record by id. Same handler as PATCH /, but
// only for the caller's own id.
router.patch(
  "/:id",
  auth,
  authedHandler<{ id: string }, ProfileBody>(async (req, res) => {
    if (req.params.id !== req.user.id) throw new ForbiddenError("You can only edit your own profile");

    return await updateOwnProfile(req as AuthedRequest<Params, ProfileBody>, res);
  }),
);

export default router;
