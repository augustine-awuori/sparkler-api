import { Router } from "express";

import { studentCodeSchema, studentEmailSchema } from "../domain/studentEmail.js";
import { authedHandler } from "../http/handler.js";
import { auth } from "../http/middlewares/authenticate.js";
import {
  confirmStudentCode,
  isStudentVerified,
  sendStudentCode,
} from "../services/studentVerification.js";

const router = Router();

/** Not from the directory, whose cache can be a day old. */
router.get(
  "/me",
  auth,
  authedHandler(async (req, res) => {
    res.send({ studentVerified: await isStudentVerified(req.user.id) });
  }),
);

router.post(
  "/",
  auth,
  authedHandler(async (req, res) => {
    const { email } = studentEmailSchema.parse(req.body);
    await sendStudentCode(req.user.id, email);
    res.status(202).send({ sent: true });
  }),
);

router.post(
  "/confirm",
  auth,
  authedHandler(async (req, res) => {
    const { code } = studentCodeSchema.parse(req.body);
    await confirmStudentCode(req.user.id, code);
    res.send({ studentVerified: true });
  }),
);

export default router;
