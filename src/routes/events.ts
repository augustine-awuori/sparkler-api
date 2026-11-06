import { Router } from "express";

import { eventListSchema, newEventSchema } from "../domain/gathering.types.js";
import { authedHandler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import {
  createEvent,
  goToEvent,
  listEvents,
  removeEvent,
  skipEvent,
} from "../services/gatherings.js";

type IdParams = { id: string };

const router = Router();

router.get(
  "/",
  auth,
  authedHandler(async (req, res) => {
    res.send(await listEvents(req.user.id, eventListSchema.parse(req.query)));
  }),
);

router.post(
  "/",
  auth,
  authedHandler(async (req, res) => {
    res.status(201).send(await createEvent(req.user.id, newEventSchema.parse(req.body)));
  }),
);

router.put(
  "/:id/rsvp",
  auth,
  authedHandler<IdParams>(async (req, res) => {
    res.send(await goToEvent(req.params.id, req.user.id));
  }),
);

router.delete(
  "/:id/rsvp",
  auth,
  authedHandler<IdParams>(async (req, res) => {
    res.send(await skipEvent(req.params.id, req.user.id));
  }),
);

router.delete(
  "/:id",
  auth,
  authedHandler<IdParams>(async (req, res) => {
    await removeEvent(req.params.id, req.user.id);
    res.send({ removed: true });
  }),
);

export default router;
