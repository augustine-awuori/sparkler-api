import express from "express";

import { validate, Category } from "../models/category.js";
import validatingWith from "../middleware/validate.js";

const router = express.Router();

router.post("/", validatingWith(validate), async (req, res) => {
  const category = new Category(req.body);

  await category.save();

  res.send(category);
});

router.get("/", async (_req, res) => {
  const categories = await Category.find({}).sort("_id");

  res.send(categories);
});

export default router;