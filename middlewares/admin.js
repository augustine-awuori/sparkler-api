export default (req, res, next) => {
    const user = req.user;
    if (!user) return res.status(400).send({ error: "User does not exist!" });

    if (!user.isAdmin)
        return res.status(403).send({ error: "Unauthorised access" });

    next();
};
