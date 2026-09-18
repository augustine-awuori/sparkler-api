/**
 * Everything the app may store under `Sparkler.custom`.
 *
 * `custom` is an unschema'd Object in Mongo, so Mongoose validates nothing
 * inside it. This interface is the only description of its shape, and the
 * permission surface (isAdmin, verified) lives here — which is why it must
 * never be written straight from a request body.
 */
export interface SparklerCustom {
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

/** The fields a user is permitted to change about themselves. */
export interface ProfilePatch {
  name?: string;
  image?: string;
  username?: string;
}
