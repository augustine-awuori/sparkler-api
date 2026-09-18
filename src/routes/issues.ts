import { Router } from "express";

import { handler } from "../http/handler.js";
import { politeAuth } from "../http/middlewares/authenticate.js";
import { Issue, type IIssue } from "../models/issue.js";

interface IssueBody {
  issue?: Partial<IIssue>;
  sparkleId?: string;
}

const router = Router();

router.post(
  "/",
  politeAuth,
  handler<Record<string, string>, IssueBody>(async (req, res) => {
    const { issue, sparkleId } = req.body;

    // Previously req.user?._id, which the token payload never has, so `reporter`
    // was always "" and every issue failed validation.
    const newIssue = new Issue({
      sparkle: sparkleId,
      reporter: req.user?.id ?? "",
      ...issue,
    });

    res.send(await newIssue.save());
  }),
);

export default router;
