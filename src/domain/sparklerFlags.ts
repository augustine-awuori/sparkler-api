import { z } from "zod";

export const verifiedChangeSchema = z.object({ verified: z.boolean() });

export const adminChangeSchema = z.object({ isAdmin: z.boolean() });

/** The `custom` keys only an admin may set, and only through these routes. */
export type SparklerFlag = "verified" | "isAdmin";
