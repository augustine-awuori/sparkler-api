import { Router } from "express";

import { POINT_RULES, pointClaimSchema } from "../domain/points.js";
import { authedHandler, handler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { claimPoints } from "../services/points.js";
import { findSparklerById } from "../services/users.js";

const router = Router();

router.get(
  "/rules",
  handler((_req, res) => {
    res.send(
      Object.entries(POINT_RULES).map(([action, { points, dailyCap, label }]) => ({
        action,
        points,
        dailyCap,
        label,
      })),
    );
  }),
);

// A cached directory can be a day old, and your own total shouldn't look like it went down.
router.get(
  "/me",
  auth,
  authedHandler(async (req, res) => {
    res.send({ total: (await findSparklerById(req.user.id))?.points ?? 0 });
  }),
);

router.post(
  "/claims",
  auth,
  authedHandler(async (req, res) => {
    const { action, targetId } = pointClaimSchema.parse(req.body);
    res.send(await claimPoints(req.user.id, action, targetId, req.log));
  }),
);

export default router;
