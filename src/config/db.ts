import mongoose from "mongoose";

import { logger } from "../utils/logger.js";

/**
 * Connects, or throws.
 *
 * startup/db.js logged the failure and returned, so the server booted anyway
 * and every request then buffered until it timed out — a health check would
 * report the service as up. Failing fast is the correct behaviour.
 */
export async function connectDb(url: string): Promise<void> {
  await mongoose.connect(url, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    retryWrites: true,
    w: "majority",
  });

  logger().info("Connected to MongoDB");
}

export async function disconnectDb(): Promise<void> {
  await mongoose.disconnect();
}
