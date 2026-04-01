import express from "express";

import { Good } from "../models/good.js";

const router = express.Router();

router.post("/", async (req, res) => {
  try {
    const { name, description = "" } = req.body;

    if (!name) return res.status(400).send({ error: "Name is required" });

    const good = await new Good({ name, description }).save();
    res.send(good);
  } catch (error) {
    console.error(`Error creating good: ${error}`);
    res.status(500).send({ error: "Something failed while creating a good" });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const good = (await Good.findById(req.params.id)).populate("delivery");
    good
      ? res.send(good)
      : res.status(404).send({ error: "Good of the given ID does not exist" });
  } catch (error) {
    console.error(`Error getting a good: ${error}`);
    res
      .status(500)
      .send({ error: "Something failed while creating a good " + error });
  }
});

router.get("/", async (req, res) => {
  try {
    const goods = (await Good.find({})).populate("delivery");
    res.send(goods);
  } catch (error) {
    console.error(`Error getting goods: ${error}`);
    res
      .status(500)
      .send({ error: "Something failed while getting goods" + error });
  }
});

router.get("/delivery/:deliveryId", async (req, res) => {
  try {
    const goods = await Good.find({ delivery: req.params.deliveryId });
    res.send(goods);
  } catch (error) {
    console.error(`Error getting goods of a delivery: ${error}`);
    res.status(500).send({
      error: "Something failed while getting goods of a delivery" + error,
    });
  }
});

export default router;
