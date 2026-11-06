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
  "studentStatus",
  "graduationYear",
] as const;

export type ProfileStringField = (typeof PROFILE_STRING_FIELDS)[number];

export interface ProfileLocation {
  name: string;
  coords?: { lat: number; lng: number };
  precision?: "precise" | "nearest";
}

export function parseProfileLocation(value: unknown): ProfileLocation | "" | undefined {
  if (typeof value === "string") {
    const name = value.trim();
    return name ? (name.length <= 80 ? { name } : undefined) : "";
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;

  const location = value as Record<string, unknown>;
  const name = typeof location.name === "string" ? location.name.trim() : "";
  if (!name || name.length > 80) return undefined;

  const precision = location.precision;
  if (precision !== undefined && precision !== "precise" && precision !== "nearest") {
    return undefined;
  }

  if (location.coords === undefined) return { name };
  if (
    !location.coords ||
    typeof location.coords !== "object" ||
    Array.isArray(location.coords)
  ) {
    return undefined;
  }

  const { lat, lng } = location.coords as Record<string, unknown>;
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < -90 ||
    lat > 90 ||
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < -180 ||
    lng > 180
  ) {
    return undefined;
  }

  return {
    name,
    coords: { lat, lng },
    ...(precision ? { precision } : {}),
  };
}

const STUDENT_STATUSES: readonly string[] = ["student", "alumni"];
const EARLIEST_GRADUATION_YEAR = 1950;

/**
 * Blank clears either field. Both are checked here rather than in `pickProfile`,
 * which only keeps strings and would answer 200 to a nonsense value.
 */
export function isStudentStatus(value: unknown): boolean {
  return value === "" || (typeof value === "string" && STUDENT_STATUSES.includes(value));
}

export function isGraduationYear(value: unknown, now = new Date()): boolean {
  if (value === "") return true;
  if (typeof value !== "string" || !/^\d{4}$/.test(value)) return false;
  const year = Number(value);
  return year >= EARLIEST_GRADUATION_YEAR && year <= now.getFullYear();
}

export type SparklerProfile = { [K in ProfileStringField]?: string } & {
  location?: ProfileLocation | "";
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
