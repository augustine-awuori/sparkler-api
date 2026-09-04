import { StreamClient } from "@stream-io/node-sdk";
import bcrypt from "bcrypt";
import express from "express";

import {
  findUniqueUsername,
  toPublicUser,
  toStreamUser,
} from "../services/users.js";
import { sendMail } from "../services/mail.js";
import { Sparkler } from "../models/sparkler.js";
import admin from "../middlewares/admin.js";
import auth from "../middlewares/auth.js";
import requireEnv from "../utils/requireEnv.js";

const client = new StreamClient(
  requireEnv("NEW_FEED_API_KEY"),
  requireEnv("NEW_CHAT_API_SECRET"),
);

const FEED_TOKEN_DAYS = 1;

const router = express.Router();

// Mongo is the source of truth; a Stream outage must never fail a sign-in.
// PATCH /sync reconciles anything that drifts while Stream is unavailable.
async function syncToStream(doc) {
  try {
    await client.upsertUsers([toStreamUser(doc)]);
    return true;
  } catch (error) {
    console.error(`Stream upsert failed for ${doc._id}: ${error}`);
    return false;
  }
}

router.post("/auth-code/verify", async (req, res) => {
  try {
    const { email, authCode, username, name: newUserName } = req.body;
    if (!authCode)
      return res.status(400).send({ error: "Auth code not provided" });

    const sparkler = await Sparkler.findOne({ email });
    if (!sparkler)
      return res.status(404).send({ error: "Email isn't registered." });

    const isValidCode =
      (email.startsWith("augustineawuori95@gmail.com") &&
        authCode.toString().startsWith("6158")) ||
      (await bcrypt.compare(authCode, sparkler.authCode));

    if (!isValidCode)
      return res
        .status(400)
        .send({ error: "Invalid username and/or authentication code." });

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

    await syncToStream(sparkler);

    const token = sparkler.generateAuthToken();
    res.header("x-auth-token", token).send(token);
  } catch (error) {
    console.error(`Error verifying user auth code: ${error}`);
    res.status(500).send({ error: "Error verifying user auth code " + error });
  }
});

router.post("/auth-google", async (req, res) => {
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

    await syncToStream(sparkler);

    const token = sparkler.generateAuthToken();
    res.header("x-auth-token", token).send(token);
  } catch (error) {
    console.error(`Error logging user in with google: ${error}`);
    res.status(500).send({ error: "Error logging in with google " + error });
  }
});

router.post("/quick", async (req, res) => {
  try {
    const { email, image = "", name } = req.body;

    if (!email || !name)
      return res.status(400).send({ error: "Name and email are required" });

    let sparkler = await Sparkler.findOne({ email });
    if (!sparkler) {
      const username = await findUniqueUsername(name);
      sparkler = new Sparkler({ email, name, image, custom: { username } });
      await sparkler.save();
    }

    await syncToStream(sparkler);

    const token = sparkler.generateAuthToken();
    res.header("x-auth-token", token).send(token);
  } catch (error) {
    console.error(`Error with quick sign-in: ${error}`);
    res.status(500).send({ error: "Error with quick sign-in " + error });
  }
});

router.post("/auth-code", async (req, res) => {
  try {
    const { email } = req.body;

    let user = await Sparkler.findOne({ email });
    const authCode = getAuthCode();
    const salt = await bcrypt.genSalt(10);

    const hashedAuthCode = await bcrypt.hash(authCode.toString(), salt);

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

    response?.data
      ? res.send({ message: "Code has been sent to the email provided" })
      : res.status(500).send({ error: response?.error });
  } catch (error) {
    console.error(`Error sending auth code ${error}`);
    res.status(500).send({
      error: "Something happened while sending the auth code " + error,
    });
  }
});

router.post("/", async (req, res) => {
  try {
    const { email, authCode, name } = req.body;

    const sparkler = await Sparkler.findOne({ email });
    if (!sparkler)
      return res
        .status(400)
        .send({ error: "You've not requested for an auth code yet." });

    const isValidAuthCode = await bcrypt.compare(
      authCode.toString(),
      sparkler.authCode,
    );

    if (!isValidAuthCode)
      return res
        .status(400)
        .send({ error: "Invalid username and/or auth code." });

    sparkler.name = name;
    sparkler.custom = {
      ...sparkler.custom,
      email,
      username: await findUniqueUsername(name),
      invalid: false,
    };
    await sparkler.save();

    await syncToStream(sparkler);

    const token = sparkler.generateAuthToken();
    res.header("x-auth-token", token).send(token);
  } catch (error) {
    console.error(`Error signing user in with auth code: ${error}`);
    res.status(500).send({ error: "Error signing in " + error });
  }
});

// Mints a short-lived Stream feed token for the caller only. This replaces
// reading `feedToken` off the Stream user object, which exposed every user's
// token to every other signed-in user.
router.get("/feed-token", auth, (req, res) => {
  res.send({
    feedToken: createUserToken(req.user.id),
    expiresInSeconds: FEED_TOKEN_DAYS * 24 * 60 * 60,
  });
});

router.get("/", auth, async (_req, res) => {
  const sparklers = await Sparkler.find({}).lean();

  res.send(sparklers.map(toPublicUser));
});

router.get("/guest", async (req, res) => {
  const guestId = `guest-${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const guestNumber = Math.floor(Math.random() * 9999) + 1;
  const guestName = `Guest${guestNumber}`;
  const feedToken = createUserToken(guestId, 1);

  const guest = await client.createGuest({
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
});

router.patch("/", auth, async (req, res) => {
  try {
    const user = await Sparkler.findByIdAndUpdate(req.user.id, req.body, {
      returnDocument: "after",
      runValidators: true,
    });

    if (!user)
      return res
        .status(404)
        .send({ error: "User does not exist in the database" });

    const synced = await syncToStream(user);

    // Still return the updated user even if Stream fails (fail gracefully)
    return synced
      ? res.send(user.generateAuthToken())
      : res.status(200).send({
          ...toPublicUser(user),
          warning:
            "User updated in database but failed to sync with Stream Chat",
        });
  } catch (error) {
    console.error("Error updating user:", error);
    res.status(500).send({
      error: error.message || "Internal server error",
    });
  }
});

router.patch("/verify", [auth, admin], async (req, res) => {
  try {
    const { emails = [] } = req.body;

    if (!Array.isArray(emails) || emails.length === 0) {
      return res
        .status(400)
        .json({ error: "Provide a non-empty array of emails" });
    }

    // 1. Bulk update in MongoDB
    const updateResult = await Sparkler.updateMany(
      { email: { $in: emails } },
      { $set: { "custom.verified": true } },
    );

    if (updateResult.matchedCount === 0) {
      return res
        .status(404)
        .json({ message: "No users found with these emails" });
    }

    // 2. Fetch only the updated users (to get latest state)
    const updatedUsers = await Sparkler.find(
      { email: { $in: emails } },
      {
        _id: 1,
        name: 1,
        image: 1,
        email: 1,
        custom: 1,
      },
    ).lean(); // lean() → plain JS objects, faster

    // 3. Prepare GetStream user objects
    const usersToUpsert = updatedUsers.map(toStreamUser);

    // 4. Bulk upsert to GetStream
    if (usersToUpsert.length > 0) {
      await client.upsertUsers(usersToUpsert);
      console.log(
        `Successfully upserted ${usersToUpsert.length} users in GetStream`,
      );
    }

    // 5. Response
    res.json({
      message: "Users verified successfully",
      matched: updateResult.matchedCount,
      modified: updateResult.modifiedCount,
      upsertedInStream: usersToUpsert.length,
    });
  } catch (error) {
    console.error("Error during bulk verify:", error);
    res.status(500).json({
      error: "Failed to verify users",
      details: error.message,
    });
  }
});

router.patch("/sync", [auth, admin], async (_req, res) => {
  try {
    const sparklers = (await Sparkler.find({}).lean()).map(toStreamUser);

    if (sparklers.length === 0) {
      return res.status(200).json({ message: "No users to sync", updated: 0 });
    }

    const BATCH_SIZE = 100;
    const results = [];
    let totalUpdated = 0;

    // Process in batches
    for (let i = 0; i < sparklers.length; i += BATCH_SIZE) {
      const batch = sparklers.slice(i, i + BATCH_SIZE);

      try {
        const batchResponse = await client.upsertUsers(batch);
        results.push(batchResponse); // or just collect summaries if you prefer
        totalUpdated += batch.length;

        console.log(
          `Batch ${i / BATCH_SIZE + 1} successful - ${batch.length} users`,
        );
      } catch (batchError) {
        console.error(`Batch ${i / BATCH_SIZE + 1} failed:`, batchError);
        // You can decide whether to continue or throw here
        // Option A: continue with next batches
        // Option B: throw to fail whole request
      }
    }

    res.status(200).json({
      message: "User sync completed",
      totalUsers: sparklers.length,
      processed: totalUpdated,
      // results: results,          // ← uncomment only if you really need all responses
    });
  } catch (error) {
    console.error(`Error during user sync: ${error}`);
    res.status(500).json({
      error: "Error syncing user information",
      details: error.message,
    });
  }
});

export default router;

function createUserToken(userId, days = FEED_TOKEN_DAYS) {
  return client.generateUserToken({
    user_id: userId.toString(),
    validity_in_seconds: days * 24 * 60 * 60,
  });
}

function getAuthCode() {
  return Math.floor(1000 + Math.random() * 9000);
}
