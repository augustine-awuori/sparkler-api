/**
 * The profile fields a user may set about themselves, and nothing else. PATCH
 * /api/sparklers writes exactly these (as dotted `custom.<key>` paths) and the
 * public directory returns exactly these. `isProfilePrivate` is the one boolean.
 */
export const PROFILE_STRING_FIELDS = [
  "bio",
  "campus",
  "coverImage",
  "website",
  "instagram",
  "tikTok",
  "youtube",
  "linkedIn",
  "whatsApp",
  "school",
  "course",
  "year",
] as const;

export type ProfileStringField = (typeof PROFILE_STRING_FIELDS)[number];

export type SparklerProfile = { [K in ProfileStringField]?: string } & {
  isProfilePrivate?: boolean;
};

/**
 * Everything the app may store under `Sparkler.custom`.
 *
 * `custom` is an unschema'd Object in Mongo, so Mongoose validates nothing
 * inside it. This interface is the only description of its shape, and the
 * permission surface (isAdmin, verified) lives here — which is why it must
 * never be written straight from a request body.
 */
export interface SparklerCustom extends SparklerProfile {
  username?: string;
  email?: string;
  verified?: boolean;
  isAdmin?: boolean;
  isSchOfficial?: boolean;
  invalid?: boolean;
  expoPushToken?: { data: string };
  /** Legacy. Was leaked to every user via Stream; typed only so old docs read cleanly. */
  feedToken?: string;
}

/**
 * The verified JWT payload. `id` is the ONLY identity field — there is no
 * `_id` here, which is what routes/chatToken.js and routes/issues.js assumed.
 */
export interface AuthUser {
  id: string;
  name?: string;
  image?: string;
  custom: SparklerCustom;
}

export interface AuthTokenClaims extends AuthUser {
  iat?: number;
  /** Absent on tokens minted before an expiry was introduced. */
  exp?: number;
}

/**
 * The `custom` claims a freshly issued JWT carries. `feedToken` is minted per
 * issue for the token's own user and is never stored or sent to Stream — the
 * JWT only ever reaches that user. Clients read `feedToken` and `username`.
 */
export interface IssuedTokenCustom {
  username: string;
  verified: boolean;
  isAdmin: boolean;
  feedToken: string;
}
