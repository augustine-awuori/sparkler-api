import { describe, expect, it, vi } from "vitest";

const StreamClient = vi.hoisted(() => vi.fn());
vi.mock("@stream-io/node-sdk", () => ({ StreamClient }));
vi.mock("../../src/config/index.js", () => ({
  config: () => ({ stream: { apiKey: "key", apiSecret: "secret" } }),
}));

const { streamClient, STREAM_TIMEOUT_MS } = await import("../../src/services/stream.js");

describe("streamClient", () => {
  it("waits longer than the SDK's 3 seconds, so a slow answer doesn't drop pushes", () => {
    streamClient();
    expect(STREAM_TIMEOUT_MS).toBeGreaterThan(3_000);
    expect(StreamClient).toHaveBeenCalledWith("key", "secret", { timeout: STREAM_TIMEOUT_MS });
  });
});
