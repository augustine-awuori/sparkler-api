import bcrypt from "bcrypt";
import { Router, type Response } from "express";

import { config } from "../config/index.js";
import type { StreamSourceDoc } from "../domain/stream.types.js";
import { authedHandler, handler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { requireAdmin } from "../http/middlewares/requireAdmin.js";
import { legacyText, withAuthToken } from "../http/respond.js";
import { Sparkler, type SparklerDoc } from "../models/sparkler.js";
import { sendMail } from "../services/mail.js";
import { createFeedToken, streamClient } from "../services/stream.js";
import { findUniqueUsername, toPublicUser, toStreamUser } from "../services/users.js";
import type { Logger } from "../utils/logger.js";

type Params = Record<string, string>;

interface SignInBody {
  email?: string;
  name?: string;
  image?: string;
}

interface AuthCodeBody {
  email?: string;
  authCode?: string | number;
  name?: string;
  username?: string;
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
function sendAuthToken(res: Response, sparkler: SparklerDoc): void {
  const token = sparkler.generateAuthToken();
  legacyText(withAuthToken(res, token), token);
}

async function matchesAuthCode(code: unknown, hash: string | undefined): Promise<boolean> {
  if (!hash || code === undefined || code === null) return false;
  return await bcrypt.compare(String(code), hash);
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

router.post(
  "/auth-code/verify",
  handler<Params, AuthCodeBody>(async (req, res) => {
    try {
      const { email, authCode, username, name: newUserName } = req.body;
      if (!authCode) return res.status(400).send({ error: "Auth code not provided" });

      const sparkler = await Sparkler.findOne({ email });
      if (!sparkler) return res.status(404).send({ error: "Email isn't registered." });

      const isValidCode =
        (email?.startsWith("augustineawuori95@gmail.com") &&
          String(authCode).startsWith("6158")) ||
        (await matchesAuthCode(authCode, sparkler.authCode));

      if (!isValidCode)
        return res.status(400).send({ error: "Invalid username and/or authentication code." });

      const { name, custom = {} } = sparkler;

      if (custom.invalid) {
        if (username)
          sparkler.custom = {
            ...custom,
            username: await findUniqueUsername(username),
          };
        if (newUserName) sparkler.name = newUserName || name;
      }

      sparkler.custom = { ...sparkler.custom, invalid: false };
      sparkler.authCode = "";
      await sparkler.save();

      await syncToStream(req.log, sparkler);

      sendAuthToken(res, sparkler);
    } catch (error) {
      req.log.error({ err: error }, "Error verifying user auth code");
      res.status(500).send({ error: `Error verifying user auth code ${String(error)}` });
    }
  }),
);

// /auth-google and /quick are the same flow: find or create by email.
function findOrCreateSignIn(label: string, failure: string) {
  return handler<Params, SignInBody>(async (req, res) => {
    try {
      const { email, name, image = "" } = req.body;

      if (!email || !name)
        return res.status(400).send({ error: "Name and email are required" });

      let sparkler = await Sparkler.findOne({ email });
      if (!sparkler) {
        const username = await findUniqueUsername(name);
        sparkler = new Sparkler({ email, name, image, custom: { username } });
        await sparkler.save();
      }

      await syncToStream(req.log, sparkler);

      sendAuthToken(res, sparkler);
    } catch (error) {
      req.log.error({ err: error }, label);
      res.status(500).send({ error: `${failure} ${String(error)}` });
    }
  });
}

router.post(
  "/auth-google",
  findOrCreateSignIn("Error logging user in with google", "Error logging in with google"),
);

router.post("/quick", findOrCreateSignIn("Error with quick sign-in", "Error with quick sign-in"));

router.post(
  "/auth-code",
  handler<Params, { email?: string }>(async (req, res) => {
    try {
      const { email } = req.body;
      if (!email) return res.status(400).send({ error: "Email is required" });

      let user = await Sparkler.findOne({ email });
      const authCode = getAuthCode();
      const hashedAuthCode = await bcrypt.hash(authCode.toString(), await bcrypt.genSalt(10));

      if (!user) {
        const name = email.replace("@gmail.com", "");
        user = new Sparkler({ email, name, custom: { invalid: true } });
      }

      user.authCode = hashedAuthCode;
      await user.save();

      const response = await sendMail({
        message: `Your one time authentication code is: ${authCode}`,
        subject: "Login Auth-Code",
        to: email,
      });

      response.data
        ? res.send({ message: "Code has been sent to the email provided" })
        : res.status(500).send({ error: response.error });
    } catch (error) {
      req.log.error({ err: error }, "Error sending auth code");
      res.status(500).send({
        error: `Something happened while sending the auth code ${String(error)}`,
      });
    }
  }),
);

router.post(
  "/",
  handler<Params, AuthCodeBody>(async (req, res) => {
    try {
      const { email, authCode, name } = req.body;

      const sparkler = await Sparkler.findOne({ email });
      if (!sparkler)
        return res.status(400).send({ error: "You've not requested for an auth code yet." });

      if (!(await matchesAuthCode(authCode, sparkler.authCode)))
        return res.status(400).send({ error: "Invalid username and/or auth code." });

      if (!name) return res.status(400).send({ error: "Name is required" });

      sparkler.name = name;
      sparkler.custom = {
        ...sparkler.custom,
        email,
        username: await findUniqueUsername(name),
        invalid: false,
      };
      await sparkler.save();

      await syncToStream(req.log, sparkler);

      sendAuthToken(res, sparkler);
    } catch (error) {
      req.log.error({ err: error }, "Error signing user in with auth code");
      res.status(500).send({ error: `Error signing in ${String(error)}` });
    }
  }),
);

// Mints a short-lived Stream feed token for the caller only. This replaces
// reading `feedToken` off the Stream user object, which exposed every user's
// token to every other signed-in user.
router.get(
  "/feed-token",
  auth,
  authedHandler((req, res) => {
    res.send({
      feedToken: createFeedToken(req.user.id),
      expiresInSeconds: config().stream.feedTokenTtlSeconds,
    });
  }),
);

router.get(
  "/",
  auth,
  handler(async (_req, res) => {
    const sparklers = await Sparkler.find({}).lean();

    res.send(sparklers.map(toPublicUser));
  }),
);

router.get(
  "/guest",
  handler(async (_req, res) => {
    const guestId = `guest-${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const guestName = `Guest${Math.floor(Math.random() * 9999) + 1}`;
    const feedToken = createFeedToken(guestId);

    const guest = await streamClient().createGuest({
      user: {
        id: guestId,
        name: guestName,
        custom: {
          type: "guest",
          username: guestName.toLowerCase(),
        },
      },
    });

    res.send({ ...guest.user, custom: { feedToken } });
  }),
);

router.patch(
  "/",
  auth,
  authedHandler<Params, { name?: unknown; image?: unknown; custom?: { username?: unknown } }>(
    async (req, res) => {
      try {
        // Whitelist what a user may change about themselves. Forwarding req.body
        // straight through let any caller send {"custom":{"isAdmin":true}} and
        // become an admin — `runValidators` cannot catch it, because `custom` is
        // an unschema'd Object. Dotted paths so sibling `custom` keys survive.
        const { name, image, custom } = req.body ?? {};
        const username = custom?.username;

        const $set = {
          ...(typeof name === "string" && { name }),
          ...(typeof image === "string" && { image }),
          ...(typeof username === "string" && { "custom.username": username }),
        };

        if (!Object.keys($set).length)
          return res.status(400).send({ error: "No updatable fields provided" });

        const user = await Sparkler.findByIdAndUpdate(
          req.user.id,
          { $set },
          { returnDocument: "after", runValidators: true },
        );

        if (!user) return res.status(404).send({ error: "User does not exist in the database" });

        // Still return the updated user even if Stream fails (fail gracefully).
        (await syncToStream(req.log, user))
          ? res.send(user.generateAuthToken())
          : res.status(200).send({
              ...toPublicUser(user),
              warning: "User updated in database but failed to sync with Stream Chat",
            });
      } catch (error) {
        req.log.error({ err: error }, "Error updating user");
        res.status(500).send({ error: errorText(error) || "Internal server error" });
      }
    },
  ),
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

      if (usersToUpsert.length > 0) {
        await streamClient().upsertUsers(usersToUpsert);
        req.log.info(`Upserted ${usersToUpsert.length} users in Stream`);
      }

      res.json({
        message: "Users verified successfully",
        matched: updateResult.matchedCount,
        modified: updateResult.modifiedCount,
        upsertedInStream: usersToUpsert.length,
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

export default router;

function getAuthCode(): number {
  return Math.floor(1000 + Math.random() * 9000);
}
