import { z } from "zod";

/**
 * Domains universities are given: uonbi.ac.ke, ox.ac.uk, mit.edu, unsw.edu.au.
 * Worldwide lists exist, but they go stale, and most of Kenya's are on `.ac.ke`.
 * A school using something else asks the team.
 */
const UNIVERSITY_DOMAIN = /\.(ac|edu)\.[a-z]{2}$|\.edu$/;

export function isUniversityEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return Boolean(domain) && UNIVERSITY_DOMAIN.test(domain as string);
}

export const studentEmailSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email()
    .max(254)
    .refine(isUniversityEmail, { message: "Use your university email address" }),
});

export const studentCodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code"),
});
