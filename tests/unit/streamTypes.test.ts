import { describe, expect, it } from "vitest";
import type { StreamUserCustom } from "../../src/domain/stream.types.js";

describe("StreamUserCustom", () => {
  it("accepts exactly the whitelisted shape", () => {
    const ok: StreamUserCustom = {
      email: "a@b.com",
      verified: true,
      isAdmin: false,
      username: "ab",
      invalid: false,
    };

    expect(Object.keys(ok).sort()).toEqual([
      "email",
      "invalid",
      "isAdmin",
      "username",
      "verified",
    ]);
  });

  it("rejects a credential even when it arrives through a variable", () => {
    const leaky = {
      email: "a@b.com",
      verified: true,
      isAdmin: false,
      username: "ab",
      invalid: false,
      feedToken: "leaked.jwt.value",
    };

    // @ts-expect-error `feedToken` is typed `never` on StreamUserCustom, so a
    // string is unassignable to it. Excess-property checking alone would NOT
    // catch this, because `leaky` is a variable rather than a fresh literal.
    // If this directive ever becomes unused, tsc fails the build — which is the
    // signal that the compile-time leak guard has been weakened.
    const bad: StreamUserCustom = leaky;

    expect(bad.feedToken).toBe("leaked.jwt.value");
  });
});
