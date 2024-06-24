import mongoose from "mongoose";

const db = process.env.db;

export default function () {
  if (!db) return console.error("Invalid database connection string");

  mongoose
    .connect(db)
    .then(() => console.log(`Connection to database is successful!`))
    .catch((error) => console.error(`Error connecting to the DB ${error}`));
}
