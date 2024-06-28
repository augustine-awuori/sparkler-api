import express from 'express';
import bcrypt from "bcrypt";

import { User, validateUser } from "../models/user";
import validator from "../middlewares/validate";

const router = express.Router();

router.post("/", validator(validateUser), async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "Email isn't registered." });

    const isValidPassword = await bcrypt.compare(password, user.password);

    return (isValidPassword)
        ? res.send(user.generateAuthToken())
        : res.status(400).send({ error: "Invalid username and/or password." });
});

export default router;