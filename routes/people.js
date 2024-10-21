import express from "express";
import bcrypt from "bcrypt";
import _ from "lodash";

import {
    Person,
    validateUser,
    validateUserWithGoogleAccount,
} from "../models/person.js";
import auth from "../middlewares/auth.js";
import validate from "../middlewares/validate.js";

const router = express.Router();

router.post("/", validate(validateUser), async (req, res) => {
    const { email, name, password } = req.body;

    let user = await Person.findOne({ email });
    if (user) return res.status(400).send({ error: "Email is already taken" });

    user = new Person({ email, name });
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(password, salt);
    await user.save();

    res
        .status(201)
        .header("x-auth-token", user.generateAuthToken())
        .header("access-control-expose-headers", "x-auth-token")
        .send(_.omit(user, "password"));
});

router.post(
    "/quick",
    validate(validateUserWithGoogleAccount),
    async (req, res) => {
        const { email } = req.body;

        let user = await Person.findOne({ email });

        if (!user) {
            user = new Person({ ...req.body });

            await user.save();
        }

        res
            .header("x-auth-token", user.generateAuthToken())
            .header("access-control-expose-headers", "x-auth-token")
            .send(_.omit(user.toObject(), ["password"]));
    }
);

router.get("/", async (_req, res) => {
    const users = await User.find({});

    res.send(users);
});

router.patch("/", auth, async (req, res) => {
    const user = await Person.findByIdAndUpdate(req.user._id, req.body, {
        new: true,
    });

    if (!user)
        return res.status(404).send({ error: "User don't exist in the database" });

    res.send(user);
});

export default router;
