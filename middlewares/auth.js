import jwt from "jsonwebtoken";

export default (req, res, next) => {
  const token = req.header("x-auth-token");
  if (!token)
    return res
      .status(401)
      .send({ error: "Access denied. Login to get access." });

  try {
    const payload = jwt.verify(token, process.env.jwtPrivateKey);
    req.user = payload;
    next();
  } catch (err) {
    res.status(400).send({ error: "Invalid token. User doesn't exist." });
  }
};
