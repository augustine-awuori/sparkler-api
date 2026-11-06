import { Router } from "express";

import { BadRequestError } from "../domain/errors.js";
import { authedHandler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { placeSearch } from "../services/placeSearch.js";

const MIN_QUERY = 2;
const MAX_QUERY = 100;
const RESULT_LIMIT = 8;

const router = Router();

// A provider outage answers 200 with `available: false`, not an error: the
// client still lets someone type a place by hand, and has to tell "search is
// down" from "nothing matches".
router.get(
  "/search",
  auth,
  authedHandler<Record<string, string>, unknown, { q?: unknown }>(async (req, res) => {
    const query = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (query.length < MIN_QUERY || query.length > MAX_QUERY) {
      throw new BadRequestError(`Search for ${MIN_QUERY} to ${MAX_QUERY} characters`);
    }

    try {
      res.send({ available: true, places: await placeSearch.search(query, RESULT_LIMIT) });
    } catch (err) {
      req.log.warn({ err }, "Place search failed");
      res.send({ available: false, places: [] });
    }
  }),
);

export default router;
