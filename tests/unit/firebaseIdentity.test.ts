import { afterEach, describe, expect, it, vi } from "vitest";

import { UnauthorizedError, UpstreamError } from "../../src/domain/errors.js";

vi.mock("../../src/config/index.js", () => ({
  config: () => ({ firebaseApiKey: "test-api-key" }),
}));

const { verifyFirebaseIdToken } = await import("../../src/services/firebaseIdentity.js");

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyFirebaseIdToken", () => {
  it("asks Firebase to verify the token and returns its canonical identity", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        users: [
          {
            localId: "firebase-uid",
            email: "verified@example.com",
            emailVerified: true,
            displayName: "Verified",
            photoUrl: "https://example.com/photo.jpg",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyFirebaseIdToken("signed-id-token")).resolves.toEqual({
      id: "firebase-uid",
      email: "verified@example.com",
      name: "Verified",
      image: "https://example.com/photo.jpg",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-api-key",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: "signed-id-token" }),
      },
    );
  });

  it("rejects invalid Firebase tokens as unauthorized", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          { error: { message: "INVALID_ID_TOKEN" } },
          { status: 400 },
        ),
      ),
    );

    await expect(verifyFirebaseIdToken("invalid")).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("rejects Firebase identities whose email is not verified", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          users: [{ localId: "firebase-uid", email: "unverified@example.com", emailVerified: false }],
        }),
      ),
    );

    await expect(verifyFirebaseIdToken("signed-id-token")).rejects.toBeInstanceOf(
      UnauthorizedError,
    );
  });

  it("reports Firebase outages as upstream failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: { message: "UNAVAILABLE" } }, { status: 503 })),
    );

    await expect(verifyFirebaseIdToken("signed-id-token")).rejects.toBeInstanceOf(UpstreamError);
  });

  it("rejects empty tokens without contacting Firebase", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyFirebaseIdToken("  ")).rejects.toBeInstanceOf(UnauthorizedError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
