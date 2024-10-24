import express from 'express';
import bcrypt from "bcrypt";
import Joi from "joi";

import { User } from "../models/user.js";
import validator from '../middlewares/validate.js';

const router = express.Router();

const validateDetails = (details) =>
    Joi.object({
        email: Joi.string().required(),
        password: Joi.string().min(6).required(),
    }).validate(details);

router.post("/", validator(validateDetails), async (req, res) => {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).send({ error: "Email isn't registered." });
    const isValidPassword = await bcrypt.compare(password, user.password);

    return (isValidPassword)
        ? res.send(user.generateAuthToken())
        : res.status(400).send({ error: "Invalid username and/or password." });
});


export default router;