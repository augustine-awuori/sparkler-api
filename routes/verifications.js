import express from "express";

import { Verification } from "../models/verification.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
  try {
    const { image } = req.body;
    const user = req.user?.id;

    if (!image || !user)
      return res.status(400).send({
        error: "ID Image is missing or the user could not be determined",
      });

    const verification = new Verification({ image, user });
    await verification.save();

    res.send(verification);
  } catch (error) {
    console.error(`Error saving user's verification info: ${error}`);
    res.status(500).send({ error });
  }
});

router.get("/", async (_req, res) => {
  res.send(await Verification.find({}));
});

export default router;
