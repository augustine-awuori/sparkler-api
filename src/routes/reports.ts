import { Router } from "express";

import { authedHandler, handler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { validate } from "../http/middlewares/validate.js";
import { Report, validateReport } from "../models/report.js";
import { findSparklerById } from "../services/users.js";

const UNAUTHORISED = { error: "You are unauthorised for this access" };

// Previously read user.isAdmin / user.isSchOfficial, which live under `custom`,
// so this was always false and every read 403'd — even for admins.
async function isAuthorised(userId: string): Promise<boolean> {
  const custom = (await findSparklerById(userId))?.custom;
  return Boolean(custom?.isAdmin || custom?.isSchOfficial);
}

const router = Router();

router.post(
  "/",
  validate(validateReport),
  handler(async (req, res) => {
    res.send(await new Report(req.body).save());
  }),
);

router.patch(
  "/seen/:reportId",
  auth,
  authedHandler<{ reportId: string }>(async (req, res) => {
    if (!(await isAuthorised(req.user.id))) return res.status(403).send(UNAUTHORISED);

    const report = await Report.findByIdAndUpdate(
      req.params.reportId,
      { seen: true },
      { returnDocument: "after" },
    );

    report
      ? res.send(report)
      : res.status(404).send({ error: "Report does not exist in the database " });
  }),
);

router.get(
  "/:id",
  auth,
  authedHandler<{ id: string }>(async (req, res) => {
    if (!(await isAuthorised(req.user.id))) return res.status(403).send(UNAUTHORISED);

    res.send(await Report.findById(req.params.id));
  }),
);

router.get(
  "/",
  auth,
  authedHandler(async (req, res) => {
    if (!(await isAuthorised(req.user.id))) return res.status(403).send(UNAUTHORISED);

    res.send(await Report.find({}));
  }),
);

export default router;
