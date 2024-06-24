import winston from "winston";

export default function (err, _req, res) {
  console.error(err.message);

  if (typeof res.status !== "function") return;

  res?.status(500)?.send({ error: "Something failed!" });
}
