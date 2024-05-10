import mongoose from "mongoose";
import winston from "winston";

const db = process.env.db;

export default function () {
  if (!db) return winston.error("Invalid database connection string");

  mongoose
    .connect(db)
    .then(() => winston.info(`Connection to database is successful!`))
    .catch((error) => winston.error(`Error connecting to the DB ${error}`));
}
