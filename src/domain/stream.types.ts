import type { ProfileLocation, SparklerCustom, SparklerProfile } from "./user.types.js";

/**
 * Keys that must NEVER reach Stream.
 *
 * Stream echoes a user's `custom` object on every activity, comment, reaction
 * and member list it embeds them in, so anything here becomes readable by every
 * other signed-in user. Storing `feedToken` in `custom` is exactly how every
 * account's Stream token was previously exposed to every other account.
 */
type ForbiddenOnStream =
  | "feedToken"
  | "chatToken"
  | "authCode"
  | "token"
  | "password"
  | "expoPushToken"
  | "_id";

/**
 * The whitelist of `custom` fields Stream may see.
 *
 * The `?: never` half is load-bearing. TypeScript only performs excess-property
 * checking on *fresh object literals*, so with five plain required keys a
 * variable that happens to carry `feedToken: string` would still be assignable
 * — which is precisely the failure mode that occurred. Mapping the forbidden
 * keys to `never` makes `string` unassignable to them, so the compiler rejects
 * it even when the value arrives through a variable.
 */
export type StreamUserCustom = {
  email: string;
  verified: boolean;
  isAdmin: boolean;
  username: string;
  invalid: boolean;
  location?: ProfileLocation | string;
} & { [K in ForbiddenOnStream]?: never };

export interface StreamUser {
  id: string;
  name: string;
  image: string;
  custom: StreamUserCustom;
}

/**
 * A Sparkler as the unauthenticated directory returns it. No email, and the
 * same `never` guard as Stream so no credential can be added by accident.
 */
export interface DirectoryUser {
  id: string;
  name: string;
  image: string;
  /** ISO date. Absent on documents written before `timestamp` existed. */
  createdAt?: string;
  points: number;
  custom: { username: string; verified: boolean; isAdmin: boolean } & SparklerProfile & {
      [K in ForbiddenOnStream]?: never;
    };
}

/**
 * Accepted input for the projections below. Structural rather than tied to the
 * Mongoose document type, so a hydrated doc and a `.lean()` result both satisfy
 * it with no cast.
 */
export interface StreamSourceDoc {
  _id: { toString(): string };
  email?: string | null;
  name?: string | null;
  image?: string | null;
  timestamp?: number | null;
  points?: number | null;
  custom?: SparklerCustom | null;
}
