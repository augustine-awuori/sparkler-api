import { Router } from "express";

import { communityListSchema, newCommunitySchema } from "../domain/gathering.types.js";
import { authedHandler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import {
  createCommunity,
  joinCommunity,
  leaveCommunity,
  listCommunities,
  readCommunity,
  removeCommunity,
} from "../services/gatherings.js";

type SlugParams = { slug: string };

const router = Router();

router.get(
  "/",
  auth,
  authedHandler(async (req, res) => {
    res.send(await listCommunities(req.user.id, communityListSchema.parse(req.query)));
  }),
);

router.post(
  "/",
  auth,
  authedHandler(async (req, res) => {
    res.status(201).send(await createCommunity(req.user.id, newCommunitySchema.parse(req.body)));
  }),
);

router.get(
  "/:slug",
  auth,
  authedHandler<SlugParams>(async (req, res) => {
    res.send(await readCommunity(req.params.slug, req.user.id));
  }),
);

router.put(
  "/:slug/membership",
  auth,
  authedHandler<SlugParams>(async (req, res) => {
    res.send(await joinCommunity(req.params.slug, req.user.id));
  }),
);

router.delete(
  "/:slug/membership",
  auth,
  authedHandler<SlugParams>(async (req, res) => {
    res.send(await leaveCommunity(req.params.slug, req.user.id));
  }),
);

router.delete(
  "/:slug",
  auth,
  authedHandler<SlugParams>(async (req, res) => {
    await removeCommunity(req.params.slug, req.user.id);
    res.send({ removed: true });
  }),
);

export default router;
