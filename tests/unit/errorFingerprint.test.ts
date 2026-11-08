import { describe, expect, it } from "vitest";

import {
  compareVersions,
  fingerprintOf,
  normalizeMessage,
  parseStack,
} from "../../src/services/errorFingerprint.js";

const crash = (stack: string, message = "Cannot read property 'id' of undefined") => ({
  app: "mobile" as const,
  errorClass: "TypeError",
  message,
  stack,
});

describe("normalizeMessage", () => {
  it("replaces what changes between occurrences of one bug", () => {
    expect(normalizeMessage("User 64b7f0c2a1e4d93f2c1b0a9e not found after 3 tries at https://x.io/a?b=1")).toBe(
      "User <id> not found after <n> tries at <url>",
    );
    expect(normalizeMessage('Unknown key "feed:123"')).toBe("Unknown key <str>");
  });
});

describe("parseStack", () => {
  it("reads V8, Hermes and Safari frames and drops build hashes and positions", () => {
    const stack = [
      "TypeError: boom",
      "    at renderFeed (https://sparkler.website/assets/index-3fa9c2d1.js:1:2345)",
      "    at anonymous (address at index.android.bundle:1:99812)",
      "loadMore@https://sparkler.website/assets/feed-77b1e0aa.js?v=2:4:10",
    ].join("\n");

    expect(parseStack(stack)).toEqual([
      { fn: "renderFeed", file: "index.js" },
      { fn: "anonymous", file: "index.android.bundle" },
      { fn: "loadMore", file: "feed.js" },
    ]);
  });

  it("keeps a file name that merely has a long word in it", () => {
    expect(parseStack("    at x (src/lib/error-reporting.tsx:4:2)")).toEqual([
      { fn: "x", file: "error-reporting.tsx" },
    ]);
  });
});

describe("fingerprintOf", () => {
  it("groups one crash across rebuilds that move its lines", () => {
    const before = crash("    at renderFeed (https://s.io/index-aaaa1111.js:1:200)");
    const after = crash("    at renderFeed (https://s.io/index-bbbb2222.js:1:9000)");
    expect(fingerprintOf(before)).toBe(fingerprintOf(after));
  });

  it("keeps different crashes apart", () => {
    const feed = crash("    at renderFeed (index.js:1:200)");
    const chat = crash("    at renderChat (index.js:1:200)");
    expect(fingerprintOf(feed)).not.toBe(fingerprintOf(chat));
  });

  it("groups a caught error on its call-site label, whatever the stack", () => {
    const one = { ...crash("    at a (x.js:1:1)"), context: "[Stream] Could not follow" };
    const two = { ...crash("    at b (y.js:9:9)"), context: "[Stream] Could not follow" };
    expect(fingerprintOf(one)).toBe(fingerprintOf(two));
  });

  it("keeps the same error apart across apps", () => {
    const stack = "    at renderFeed (index.js:1:200)";
    expect(fingerprintOf(crash(stack))).not.toBe(fingerprintOf({ ...crash(stack), app: "web" }));
  });
});

describe("compareVersions", () => {
  it("orders numerically, not as text", () => {
    expect(compareVersions("3.0.10", "3.0.9")).toBe(1);
    expect(compareVersions("3.0.8", "3.0.8")).toBe(0);
    expect(compareVersions("3.0", "3.0.1")).toBe(-1);
    expect(compareVersions("2026.11.08-ab12cd", "2026.11.7-ffffff")).toBe(1);
  });
});
