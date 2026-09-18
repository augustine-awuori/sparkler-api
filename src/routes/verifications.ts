import { Router } from "express";

import { authedHandler, handler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { Verification } from "../models/verification.js";

const router = Router();

router.post(
  "/",
  auth,
  authedHandler<Record<string, string>, { image?: string }>(async (req, res) => {
    const { image } = req.body;

    if (!image)
      return res.status(400).send({
        error: "ID Image is missing or the user could not be determined",
      });

    res.send(await new Verification({ image, user: req.user.id }).save());
  }),
);

router.get(
  "/",
  handler(async (_req, res) => {
    res.send(await Verification.find({}));
  }),
);

export default router;
