import { Router } from "express";

import { NotFoundError, TooManyRequestsError } from "../domain/errors.js";
import {
  isIssueId,
  issueChangeSchema,
  issueListQuerySchema,
  issueNoteSchema,
  newIssueSchema,
} from "../domain/issue.types.js";
import { authedHandler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { requireIssueStaff } from "../http/middlewares/requireIssueStaff.js";
import { Issue, type IssueDoc } from "../models/issue.js";
import { sendInBackground } from "../services/accountMail.js";
import {
  addIssueNote,
  applyIssueChange,
  createIssue,
  isReportLimitReached,
  issueReportedMails,
  reporterUpdateMail,
  toReporterView,
  toStaffView,
} from "../services/issues.js";
import { findSparklerById } from "../services/users.js";
import type { Logger } from "../utils/logger.js";

type IdParams = { id: string };

const router = Router();

async function issueOr404(id: string): Promise<IssueDoc> {
  const issue = isIssueId(id) ? await Issue.findById(id) : null;
  if (!issue) throw new NotFoundError("That issue doesn't exist");
  return issue;
}

/** Never awaited: a mail problem must not undo a change that's already saved. */
function tellReporter(log: Logger, issue: IssueDoc, entriesSeen: number) {
  reporterUpdateMail(issue, issue.timeline.slice(entriesSeen))
    .then((mails) => (mails.length ? sendInBackground(log, mails) : undefined))
    .catch((err: unknown) => log.error({ err }, "Could not mail a reporter about their issue"));
}

router.post(
  "/",
  auth,
  authedHandler(async (req, res) => {
    const fields = newIssueSchema.parse(req.body);
    if (await isReportLimitReached(req.user.id)) {
      throw new TooManyRequestsError("You've sent a lot of reports. Try again in a while.");
    }

    const issue = await createIssue(req.user.id, fields);

    // After the save, and never awaited: a mail problem must not lose a report.
    issueReportedMails(issue)
      .then((mails) => sendInBackground(req.log, mails))
      .catch((err: unknown) => req.log.error({ err }, "Could not mail admins about an issue"));

    res.status(201).send(toReporterView(issue));
  }),
);

// Before `/:id`, so it's never read as an id.
router.get(
  "/mine",
  auth,
  authedHandler(async (req, res) => {
    const issues = await Issue.find({ "reportedBy.userId": req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.send(issues.map(toReporterView));
  }),
);

router.get(
  "/",
  auth,
  requireIssueStaff,
  authedHandler(async (req, res) => {
    const { status, priority, handledBy, cursor, limit } = issueListQuerySchema.parse(req.query);
    const filter = {
      ...(status && { status }),
      ...(priority && { priority }),
      ...(handledBy === "none" && { handledBy: null }),
      ...(handledBy && handledBy !== "none" && { "handledBy.userId": handledBy }),
      ...(cursor && { _id: { $lt: cursor } }),
    };

    const issues = await Issue.find(filter)
      .sort({ _id: -1 })
      .limit(limit + 1);
    const page = issues.slice(0, limit);
    res.send({
      issues: page.map(toStaffView),
      nextCursor: issues.length > limit ? page[page.length - 1]?._id.toString() : null,
    });
  }),
);

// Answers 404 rather than 403 to anyone else, so it doesn't confirm an id exists.
router.get(
  "/:id",
  auth,
  authedHandler<IdParams>(async (req, res) => {
    const issue = await issueOr404(req.params.id);
    const viewer = await findSparklerById(req.user.id);

    if (viewer?.custom?.isAdmin) return res.send(toStaffView(issue));
    if (issue.reportedBy.userId === req.user.id) return res.send(toReporterView(issue));
    throw new NotFoundError("That issue doesn't exist");
  }),
);

router.patch(
  "/:id",
  auth,
  requireIssueStaff,
  authedHandler<IdParams>(async (req, res) => {
    const change = issueChangeSchema.parse(req.body);
    const issue = await issueOr404(req.params.id);
    const seen = issue.timeline.length;
    const saved = await applyIssueChange(issue, req.user.id, change);
    tellReporter(req.log, saved, seen);
    res.send(toStaffView(saved));
  }),
);

router.post(
  "/:id/notes",
  auth,
  requireIssueStaff,
  authedHandler<IdParams>(async (req, res) => {
    const note = issueNoteSchema.parse(req.body);
    const issue = await issueOr404(req.params.id);
    const seen = issue.timeline.length;
    const saved = await addIssueNote(issue, req.user.id, note);
    tellReporter(req.log, saved, seen);
    res.status(201).send(toStaffView(saved));
  }),
);

export default router;
