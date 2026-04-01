import express from "express";

import { Delivery } from "../models/delivery.js";
import auth from "../middlewares/auth.js";

const router = express.Router();

router.post("/", auth, async (req, res) => {
  try {
    const { name, description = "", expectedArrivalTime } = req.body;

    if (!name) return res.status(400).send({ error: "Name is required" });

    const delivery = await new Delivery({
      name,
      description,
      user: req.user._id.toString(),
      expectedArrivalTime,
    }).save();
    res.send(delivery);
  } catch (error) {
    console.error(`Error creating delivery: ${error}`);
    res
      .status(500)
      .send({ error: "Something failed while creating a delivery" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const delivery = (await Delivery.findById(req.params.id)).populate("user");
    delivery
      ? res.send(delivery)
      : res
          .status(404)
          .send({ error: "delivery of the given ID does not exist" });
  } catch (error) {
    console.error(`Error getting a delivery: ${error}`);
    res
      .status(500)
      .send({ error: "Something failed while creating a delivery " + error });
  }
});

router.patch("/:id", auth, async (req, res) => {
  try {
    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      { ...req.body },
      { new: true },
    );
    res.send(delivery);
  } catch (error) {
    console.error(`Error updating a delivery`);
    res
      .status(500)
      .send({ error: "Something failed while updating a delivery " + error });
  }
});

export default router;
