import { StreamClient } from "@stream-io/node-sdk";
import bcrypt from "bcrypt";
import express from "express";

import { findUniqueUsername } from "../services/users.js";
import { getAuthCode } from "../utils/func.js";
import { sendMail } from "../services/mail.js";
import { Sparkler } from "../models/sparkler.js";
import auth from "../middlewares/auth.js";

const client = new StreamClient(
  process.env.NEW_FEED_API_KEY,
  process.env.NEW_CHAT_API_SECRET
);

const router = express.Router();

router.post("/auth-code/verify", async (req, res) => {
  const { email, authCode } = req.body;
  if (!authCode)
    return res.status(400).send({ error: "Auth code not provided" });

  const sparkler = await Sparkler.findOne({ email });
  if (!sparkler)
    return res.status(404).send({ error: "Email isn't registered." });

  const isValidCode = await bcrypt.compare(authCode, sparkler.authCode);

  if (!isValidCode)
    return res
      .status(400)
      .send({ error: "Invalid username and/or authentication code." });

  const { name, id, image } = sparkler;
  const feedToken = client.generateUserToken({
    user_id: id.toString(),
    validity_in_seconds: 365 * 24 * 60 * 60, // 1 yr ahead
  });

  // try {
  //   await client.feeds.getOrCreateFeed({
  //     feed_group_id: "user",
  //     feed_id: sparkler.id,
  //   });
  //   await client.feeds.getOrCreateFeed({
  //     feed_group_id: "timeline",
  //     feed_id: sparkler.id,
  //   });
  //   await client.feeds.getOrCreateFeed({
  //     feed_group_id: "notification",
  //     feed_id: sparkler.id,
  //   });
  // } catch (error) {
  //   console.error(`Error initializing feeds`);
  // }

  if (sparkler.custom.invalid) {
    await client.upsertUsers([
      {
        id,
        name,
        image,
        custom: { feedToken, invalid: false },
      },
    ]);
  }

  sparkler.custom = { ...sparkler.custom, feedToken, invalid: false };
  sparkler.authCode = "";
  await sparkler.save();

  const token = sparkler.generateAuthToken();
  res.header("x-auth-token", token).send(token);
});

router.post("/auth-code", async (req, res) => {
  const { email } = req.body;

  let user = await Sparkler.findOne({ email });
  const authCode = getAuthCode();
  const salt = await bcrypt.genSalt(10);
  console.log("auth code: ", authCode);
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
      sparkler.authCode
    );

    if (!isValidAuthCode)
      return res
        .status(400)
        .send({ error: "Invalid username and/or auth code." });

    const feedToken = client.generateUserToken({ id: sparkler._id.toString() });
    sparkler.name = name;
    sparkler.custom = {
      email,
      username: await findUniqueUsername(name),
      invalid: false,
      feedToken,
    };
    await sparkler.save();

    await client.upsertUsers([
      {
        id: sparkler.id.toString(),
        name,
        custom: { ...sparkler.custom },
      },
    ]);
    // try {
    //   await client.feeds.getOrCreateFeed({
    //     feed_group_id: "user",
    //     feed_id: sparkler.id,
    //   });
    //   await client.feeds.getOrCreateFeed({
    //     feed_group_id: "timeline",
    //     feed_id: sparkler.id,
    //   });
    //   await client.feeds.getOrCreateFeed({
    //     feed_group_id: "notification",
    //     feed_id: sparkler.id,
    //   });
    // } catch (error) {
    //   console.error(`Error initializing feeds :${error}`);
    // }

    const token = sparkler.generateAuthToken();
    res.header("x-auth-token", token).send(token);
  } catch (error) {
    console.error(error);
  }
});

router.get("/", async (_req, res) => {
  res.send(await Sparkler.find({}));
});

router.get("/guest", async (req, res) => {
  const guestId = `guest-${Date.now()}_${Math.random()
    .toString(36)
    .substr(2, 9)}`;
  const guestNumber = Math.floor(Math.random() * 9999) + 1;
  const guestName = `Guest${guestNumber}`;

  const feedToken = client.generateUserToken({
    user_id: guestId,
    validity_in_seconds: 24 * 60 * 60,
  });

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
    const user = await Sparkler.findByIdAndUpdate(req.user._id, req.body, {
      new: true,
    });

    if (!user)
      return res
        .status(404)
        .send({ error: "User does not exist in the database" });

    const { name, username, image, coverImage, verified, isAdmin } = user;
    const response = await client.upsertUsers([
      {
        id: req.user._id,
        custom: { coverImage, verified, isAdmin, username },
        name,
        image,
      },
    ]);

    response
      ? res.send(user.generateAuthToken())
      : res
          .status(500)
          .send({ error: `Error updating user info: ${streamUser}` });
  } catch (error) {
    console.error(`Error updating user ${error}`);
    res.status(500).send({ error });
  }
});

export default router;
