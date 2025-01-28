import { User } from "../models/user.js";

export default async (req, res, next) => {
    let user = req.user;
    if (!user) return res.status(400).send({ error: "User does not exist!" });

    user = await User.findById(user._id);
    if (!user?.isAdmin)
        return res.status(403).send({ error: "Unauthorised access" });

    next();
};
