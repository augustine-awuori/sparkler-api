import { Router } from "express";

import { authedHandler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import { withAuthToken } from "../http/respond.js";
import { chatClient } from "../services/stream.js";
import { findSparklerById } from "../services/users.js";

const router = Router();

router.post(
  "/",
  auth,
  authedHandler(async (req, res) => {
    // Previously read req.user._id, which the token payload never has, so every
    // call threw. The token is minted on demand: the old code "cached" it on the
    // user, but `chatToken` is not in the schema, so that write was discarded.
    const user = await findSparklerById(req.user.id);
    if (!user)
      return res.status(404).send({ error: "You don't exist in the database. Sign Up" });

    withAuthToken(res, user.generateAuthToken()).send(chatClient().createToken(req.user.id));
  }),
);

export default router;
