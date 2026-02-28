import express from "express";

import { Report, validateReport } from "../models/report.js";
import { Sparkler } from "../models/sparkler.js";
import auth from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";

const router = express.Router();

router.post("/", validate(validateReport), async (req, res) => {
  const report = new Report(req.body);

  await report.save();

  res.send(report);
});

router.patch("/seen/:reportId", auth, async (req, res) => {
  if (!(await isAuthorised(req.user.id)))
    return res
      .status(403)
      .send({ error: "You are unauthorised for this access" });

  const report = await Report.findByIdAndUpdate(
    req.params.reportId,
    { seen: true },
    { new: true },
  );

  report
    ? res.send(report)
    : res.status(404).send({ error: "Report does not exist in the database " });
});

router.get("/:id", auth, async (req, res) => {
  if (await isAuthorised(req.user.id))
    return res.send(await Report.findById(req.params.id));

  res.status(403).send({ error: "You are unauthorised for this access" });
});

router.get("/", auth, async (req, res) => {
  if (await isAuthorised(req.user.id)) return res.send(await Report.find({}));

  res.status(403).send({ error: "You are unauthorised for this access" });
});

async function isAuthorised(userId) {
  const user = await Sparkler.findById(userId);
  return user.isAdmin || user.isSchOfficial;
}

export default router;
