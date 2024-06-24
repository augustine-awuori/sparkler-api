export default function (err, _req, res) {
  if (err.message) console.error(err.message);

  if (typeof res.status !== "function") return;

  res?.status(500)?.send({ error: "Something failed!" });
}
