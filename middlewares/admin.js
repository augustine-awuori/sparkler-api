import { Sparkler } from "../models/sparkler.js";

export default async (req, res, next) => {
  let user = req.user;
  if (!user) return res.status(400).send({ error: "User does not exist!" });

  user = await Sparkler.findById(user.id);
  if (!user?.isAdmin)
    return res.status(403).send({ error: "Unauthorised access" });

  next();
};
