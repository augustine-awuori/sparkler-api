import { Router, type Request } from "express";

import { NotFoundError, UnauthorizedError } from "../domain/errors.js";
import {
  assignSchema,
  bookmarkParamsSchema,
  bulkStatusSchema,
  commentSchema,
  developerChangeSchema,
  developerListQuerySchema,
  errorIngestSchema,
  eventListQuerySchema,
  groupListQuerySchema,
  groupStatusChangeSchema,
  isObjectId,
  rejectSchema,
  resolveSchema,
  statsQuerySchema,
} from "../domain/errorTracking.types.js";
import { authedHandler, handler } from "../http/handler.js";
import { auth, politeAuth } from "../http/middlewares/authenticate.js";
import { rateLimit } from "../http/middlewares/rateLimit.js";
import { requireIssueStaff, requireStaffAdmin } from "../http/middlewares/requireIssueStaff.js";
import { Developer } from "../models/developer.js";
import { ErrorGroup } from "../models/errorGroup.js";
import { sendInBackground } from "../services/accountMail.js";
import { addBookmark, listBookmarks, removeBookmark } from "../services/bookmarks.js";
import {
  changeDeveloper,
  developerFor,
  developerOr404,
  developerStats,
  registerDeveloper,
  staffAdmins,
  toDeveloperView,
  type StaffMember,
} from "../services/developers.js";
import {
  acceptAssignment,
  assignGroup,
  commentOnGroup,
  errorStats,
  groupBreakdown,
  groupOr404,
  ingestEvent,
  listEvents,
  listGroups,
  rejectAssignment,
  resolveGroup,
  setGroupStatus,
  toGroupView,
  unassignGroup,
  type WorkflowResult,
} from "../services/errorGroups.js";
import { accessApprovedMail, accessRequestedMails } from "../services/errorMail.js";
import { findSparklerById } from "../services/users.js";

type IdParams = { id: string };

const router = Router();
const staff = [auth, requireIssueStaff] as const;

function staffOf(req: Pick<Request, "staff">): StaffMember {
  if (!req.staff) throw new UnauthorizedError();
  return req.staff;
}

function eventsIn(body: unknown): number {
  const events = (body as { events?: unknown } | undefined)?.events;
  return Array.isArray(events) ? events.length : 1;
}

/**
 * Open to anyone, because a crash can happen before sign-in. A valid token's
 * user id replaces the one in the body, so a client can't blame someone else.
 * One bad event is logged and skipped rather than failing the batch, which the
 * client would only resend.
 */
router.post(
  "/events",
  rateLimit({ capacity: 120, perMinute: 60, cost: (req) => eventsIn(req.body) }),
  politeAuth,
  handler(async (req, res) => {
    const { events } = errorIngestSchema.parse(req.body);
    const signedIn = req.user?.id;
    for (const event of events) {
      await ingestEvent(signedIn ? { ...event, userId: signedIn } : event).catch((err: unknown) =>
        req.log.error({ err }, "Could not store an error event"),
      );
    }
    res.status(202).send({ accepted: events.length });
  }),
);

// ── Developers ────────────────────────────────────────────────────────────

router.post(
  "/developers/register",
  auth,
  authedHandler(async (req, res) => {
    const { developer, isNewRequest } = await registerDeveloper(req.user.id);
    if (isNewRequest) {
      sendInBackground(req.log, accessRequestedMails(await staffAdmins(), developer));
    }
    res.status(isNewRequest ? 201 : 200).send(toDeveloperView(developer));
  }),
);

// Any signed-in user, so the dashboard can tell "not registered" from "waiting".
router.get(
  "/developers/me",
  auth,
  authedHandler(async (req, res) => {
    const developer = await developerFor(req.user.id);
    if (!developer) throw new NotFoundError("You haven't asked to join the team");
    res.send(toDeveloperView(developer));
  }),
);

router.get(
  "/developers/stats",
  ...staff,
  handler(async (_req, res) => {
    res.send(await developerStats());
  }),
);

router.get(
  "/developers",
  ...staff,
  handler(async (req, res) => {
    const { status } = developerListQuerySchema.parse(req.query);
    const developers = await Developer.find(status ? { status } : {}).sort({ status: 1, name: 1 });
    res.send(developers.map(toDeveloperView));
  }),
);

router.patch(
  "/developers/:id",
  ...staff,
  requireStaffAdmin,
  handler<IdParams>(async (req, res) => {
    const change = developerChangeSchema.parse(req.body);
    if (!isObjectId(req.params.id)) throw new NotFoundError("That developer doesn't exist");
    const { developer, approved } = await changeDeveloper(await developerOr404(req.params.id), staffOf(req), change);
    if (approved) sendInBackground(req.log, [accessApprovedMail(developer)]);
    res.send(toDeveloperView(developer));
  }),
);

// ── Error groups ──────────────────────────────────────────────────────────

router.get(
  "/stats",
  ...staff,
  handler(async (req, res) => {
    const { range, app } = statsQuerySchema.parse(req.query);
    res.send(await errorStats(range, app));
  }),
);

router.get(
  "/groups",
  ...staff,
  handler(async (req, res) => {
    res.send(await listGroups(groupListQuerySchema.parse(req.query), staffOf(req)));
  }),
);

router.post(
  "/groups/bulk-status",
  ...staff,
  handler(async (req, res) => {
    const { ids, status, note } = bulkStatusSchema.parse(req.body);
    const actor = staffOf(req);
    const groups = await ErrorGroup.find({ _id: { $in: ids } });
    const updated: string[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const group of groups) {
      try {
        const { mails } = await setGroupStatus(group, actor, status, note);
        sendInBackground(req.log, mails);
        updated.push(group._id.toString());
      } catch (err) {
        skipped.push({ id: group._id.toString(), reason: err instanceof Error ? err.message : "Failed" });
      }
    }
    res.send({ updated, skipped });
  }),
);

router.get(
  "/groups/:id",
  ...staff,
  handler<IdParams>(async (req, res) => {
    res.send(toGroupView(await groupOr404(req.params.id)));
  }),
);

router.get(
  "/groups/:id/events",
  ...staff,
  handler<IdParams>(async (req, res) => {
    const { cursor, limit } = eventListQuerySchema.parse(req.query);
    res.send(await listEvents(await groupOr404(req.params.id), cursor, limit));
  }),
);

router.get(
  "/groups/:id/breakdown",
  ...staff,
  handler<IdParams>(async (req, res) => {
    res.send(await groupBreakdown(await groupOr404(req.params.id)));
  }),
);

/** Saves, answers, then mails in the background, so a mail outage can't undo a change. */
function workflowRoute(
  run: (
    req: Request<IdParams, unknown, unknown, Record<string, unknown>>, actor: StaffMember, group: Awaited<ReturnType<typeof groupOr404>>) => Promise<WorkflowResult>,
) {
  return handler<IdParams>(async (req, res) => {
    const { group, mails } = await run(req, staffOf(req), await groupOr404(req.params.id));
    sendInBackground(req.log, mails);
    res.send(toGroupView(group));
  });
}

router.patch(
  "/groups/:id",
  ...staff,
  workflowRoute(async (req, actor, group) => {
    const { status, note } = groupStatusChangeSchema.parse(req.body);
    return await setGroupStatus(group, actor, status, note);
  }),
);

router.post(
  "/groups/:id/assign",
  ...staff,
  workflowRoute(async (req, actor, group) => assignGroup(group, actor, assignSchema.parse(req.body).developerId)),
);

router.post("/groups/:id/unassign", ...staff, workflowRoute(async (_req, actor, group) => unassignGroup(group, actor)));

router.post(
  "/groups/:id/assignment/accept",
  ...staff,
  workflowRoute(async (_req, actor, group) => acceptAssignment(group, actor)),
);

router.post(
  "/groups/:id/assignment/reject",
  ...staff,
  workflowRoute(async (req, actor, group) => rejectAssignment(group, actor, rejectSchema.parse(req.body ?? {}).reason)),
);

router.post(
  "/groups/:id/resolve",
  ...staff,
  workflowRoute(async (req, actor, group) => resolveGroup(group, actor, resolveSchema.parse(req.body ?? {}).note)),
);

router.post(
  "/groups/:id/comments",
  ...staff,
  handler<IdParams>(async (req, res) => {
    const { body } = commentSchema.parse(req.body);
    const group = await commentOnGroup(await groupOr404(req.params.id), staffOf(req), body);
    res.status(201).send(toGroupView(group));
  }),
);

// ── People ────────────────────────────────────────────────────────────────

/**
 * How to email someone who hit an error, for a team admin who wants to reach
 * out. Event lists carry the public directory view, never an email; this hands
 * one over only when an admin asks for that person, and logs who asked.
 */
router.get(
  "/people/:id/contact",
  ...staff,
  requireStaffAdmin,
  handler<IdParams>(async (req, res) => {
    const person = await findSparklerById(req.params.id);
    if (!person) throw new NotFoundError("That person no longer has an account");
    req.log.info({ userId: req.params.id, by: staffOf(req).developerId }, "Showed a user's email to a team admin");
    res.send({ email: person.email });
  }),
);

// ── Bookmarks ─────────────────────────────────────────────────────────────
// Each person's own: errors and reports saved to come back to.

type BookmarkParams = { kind: string; id: string };

router.get(
  "/bookmarks",
  ...staff,
  handler(async (req, res) => {
    res.send(await listBookmarks(staffOf(req).developerId));
  }),
);

router.put(
  "/bookmarks/:kind/:id",
  ...staff,
  handler<BookmarkParams>(async (req, res) => {
    const { kind, id } = bookmarkParamsSchema.parse(req.params);
    await addBookmark(staffOf(req).developerId, kind, id);
    res.status(204).end();
  }),
);

router.delete(
  "/bookmarks/:kind/:id",
  ...staff,
  handler<BookmarkParams>(async (req, res) => {
    const { kind, id } = bookmarkParamsSchema.parse(req.params);
    await removeBookmark(staffOf(req).developerId, kind, id);
    res.status(204).end();
  }),
);

export default router;
