import { config } from "../config/index.js";
import { UnauthorizedError, UpstreamError } from "../domain/errors.js";

interface IdentityToolkitUser {
  localId?: unknown;
  email?: unknown;
  emailVerified?: unknown;
  displayName?: unknown;
  photoUrl?: unknown;
}

interface IdentityToolkitResponse {
  users?: IdentityToolkitUser[];
  error?: { message?: string };
}

export interface FirebaseIdentity {
  id: string;
  email: string;
  name?: string;
  image?: string;
}

const INVALID_TOKEN_ERRORS = new Set([
  "INVALID_ID_TOKEN",
  "TOKEN_EXPIRED",
  "USER_NOT_FOUND",
  "CREDENTIAL_TOO_OLD_LOGIN_AGAIN",
]);

/**
 * Firebase Identity Toolkit validates the signed ID token and returns its
 * canonical account identity, so the request body cannot choose another email.
 */
export async function verifyFirebaseIdToken(idToken: string): Promise<FirebaseIdentity> {
  if (!idToken.trim()) throw new UnauthorizedError("Firebase ID token is required");

  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(config().firebaseApiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      },
    );
  } catch (error) {
    throw new UpstreamError("Firebase identity verification failed", error);
  }

  let result: IdentityToolkitResponse;
  try {
    result = (await response.json()) as IdentityToolkitResponse;
  } catch (error) {
    throw new UpstreamError("Firebase identity verification returned an invalid response", error);
  }

  if (!response.ok) {
    if (result.error?.message && INVALID_TOKEN_ERRORS.has(result.error.message)) {
      throw new UnauthorizedError("Invalid or expired Firebase ID token");
    }
    throw new UpstreamError("Firebase identity verification failed");
  }

  const user = result.users?.[0];
  if (
    typeof user?.localId !== "string" ||
    typeof user.email !== "string" ||
    !user.email.trim() ||
    user.emailVerified !== true
  ) {
    if (user?.emailVerified === false) {
      throw new UnauthorizedError("Firebase email must be verified");
    }
    throw new UpstreamError("Firebase identity response is missing the account identity");
  }

  return {
    id: user.localId,
    email: user.email.trim(),
    ...(typeof user.displayName === "string" && user.displayName.trim()
      ? { name: user.displayName.trim() }
      : {}),
    ...(typeof user.photoUrl === "string" && user.photoUrl.trim()
      ? { image: user.photoUrl.trim() }
      : {}),
  };
}
