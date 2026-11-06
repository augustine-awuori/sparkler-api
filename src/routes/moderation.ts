import { Router } from "express";

import { authedHandler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { requireAdmin } from "../http/middlewares/requireAdmin.js";
import { decideReport, moderationDecisionSchema, readReviewQueue } from "../services/moderation.js";

type IdParams = { id: string };

const router = Router();

router.get(
  "/queue",
  auth,
  requireAdmin,
  authedHandler(async (req, res) => {
    const next = typeof req.query.next === "string" ? req.query.next : undefined;
    res.send(await readReviewQueue(next));
  }),
);

router.post(
  "/queue/:id/decision",
  auth,
  requireAdmin,
  authedHandler<IdParams>(async (req, res) => {
    const decision = moderationDecisionSchema.parse(req.body);
    await decideReport(req.params.id, req.user.id, decision);
    res.send({ decided: true });
  }),
);

export default router;
