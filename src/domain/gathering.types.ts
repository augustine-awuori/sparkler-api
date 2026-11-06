import { z } from "zod";

const OBJECT_ID = /^[a-f\d]{24}$/i;

export const isObjectId = (value: string) => OBJECT_ID.test(value);

const optionalSchool = z.string().regex(OBJECT_ID).optional();

export const newCommunitySchema = z.object({
  name: z.string().trim().min(3).max(60),
  description: z.string().trim().max(300).default(""),
  school: optionalSchool,
});

export const communityListSchema = z.object({
  school: optionalSchool,
  mine: z.enum(["true"]).optional(),
});

const SLUG_WORDS = /[^a-z0-9]+/g;

/** Readable in a link, with a suffix since two societies can share a name. */
export function communitySlug(name: string, random = Math.random): string {
  const words = name.toLowerCase().replace(SLUG_WORDS, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `${words || "community"}-${random().toString(36).slice(2, 7)}`;
}

export const newEventSchema = z
  .object({
    title: z.string().trim().min(3).max(100),
    description: z.string().trim().max(1000).default(""),
    place: z.string().trim().min(2).max(120),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date().optional(),
    school: optionalSchool,
    community: z.string().trim().max(60).optional(),
  })
  .refine((event) => event.startsAt.getTime() > Date.now(), {
    message: "An event has to start in the future",
    path: ["startsAt"],
  })
  .refine((event) => !event.endsAt || event.endsAt > event.startsAt, {
    message: "An event has to end after it starts",
    path: ["endsAt"],
  });

export const eventListSchema = z.object({
  school: optionalSchool,
  community: z.string().trim().max(60).optional(),
});
