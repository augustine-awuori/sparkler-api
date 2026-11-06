import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Application } from "express";
import request from "supertest";
import jwt from "jsonwebtoken";

import { createApp } from "../../src/app.js";
import { connectDb, disconnectDb } from "../../src/config/db.js";
import { loadConfig } from "../../src/config/index.js";
import { CachedPlaceSearch, PhotonPlaceSearch, type Place } from "../../src/services/placeSearch.js";

let app: Application;

const KISII_UNIVERSITY = {
  properties: { name: "Kisii University", city: "Kisii", state: "Kisii", country: "Kenya" },
  geometry: { coordinates: [34.7840644, -0.6919157] },
};

function photonAnswers(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

const search = (query: string) => {
  const token = jwt.sign(
    { id: "64b000000000000000000002", custom: {} },
    process.env.jwtPrivateKey as string,
  );
  return request(app).get("/api/places/search").query({ q: query }).set("x-auth-token", token);
};

beforeAll(async () => {
  await connectDb(loadConfig().databaseUrl);
  app = createApp();
});

afterAll(async () => {
  await disconnectDb();
});

afterEach(() => vi.unstubAllGlobals());

describe("GET /api/places/search", () => {
  it("answers with places a profile can store", async () => {
    photonAnswers({ features: [KISII_UNIVERSITY] });

    const res = await search("kisii uni");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      available: true,
      places: [
        {
          name: "Kisii University",
          label: "Kisii University, Kisii, Kenya",
          coords: { lat: -0.6919157, lng: 34.7840644 },
        },
      ],
    });
  });

  it("says search is unavailable when the provider fails, rather than erroring", async () => {
    photonAnswers({}, 500);

    const res = await search("provider down");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false, places: [] });
  });

  it.each([
    ["too short", "a"],
    ["blank", "   "],
    ["too long", "x".repeat(101)],
  ])("refuses a query that is %s", async (_label, query) => {
    photonAnswers({ features: [] });
    expect((await search(query)).status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("needs a signed-in caller", async () => {
    expect((await request(app).get("/api/places/search").query({ q: "kisii" })).status).toBe(401);
  });
});

describe("PhotonPlaceSearch", () => {
  const provider = new PhotonPlaceSearch();

  it("keeps a label short enough to store, keeping the country", async () => {
    photonAnswers({
      features: [
        {
          properties: {
            name: "A Very Long University Name Indeed Of Something",
            city: "A Rather Long City Name Here",
            state: "Some State",
            country: "Kenya",
          },
          geometry: { coordinates: [36, -1] },
        },
      ],
    });

    const [place] = await provider.search("long", 8);

    expect(place?.label.length).toBeLessThanOrEqual(80);
    expect(place?.label.endsWith("Kenya")).toBe(true);
  });

  it("uses a street where a place has no name, and skips what can't be placed", async () => {
    photonAnswers({
      features: [
        { properties: { street: "Moi Avenue", country: "Kenya" }, geometry: { coordinates: [36, -1] } },
        { properties: { country: "Kenya" }, geometry: { coordinates: [36, -1] } },
        { properties: { name: "No coordinates" }, geometry: {} },
      ],
    });

    const places = await provider.search("moi", 8);

    expect(places.map((place) => place.label)).toEqual(["Moi Avenue, Kenya"]);
  });

  it("collapses results that would read the same", async () => {
    photonAnswers({ features: [KISII_UNIVERSITY, KISII_UNIVERSITY] });
    expect(await provider.search("kisii", 8)).toHaveLength(1);
  });

  it("escapes the query", async () => {
    photonAnswers({ features: [] });
    await provider.search("a&limit=999", 8);
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toContain("q=a%26limit%3D999&limit=8");
  });
});

describe("CachedPlaceSearch", () => {
  const PLACE: Place = { name: "A", label: "A", coords: { lat: 0, lng: 0 } };

  it("answers a repeat from memory, whatever its case", async () => {
    const provider = { search: vi.fn(async () => [PLACE]) };
    const cached = new CachedPlaceSearch(provider);

    await cached.search("Nairobi", 8);
    await cached.search("nairobi", 8);

    expect(provider.search).toHaveBeenCalledTimes(1);
  });

  it("asks again once an answer is old", async () => {
    const provider = { search: vi.fn(async () => [PLACE]) };
    let now = 0;
    const cached = new CachedPlaceSearch(provider, 1000, 500, () => now);

    await cached.search("nairobi", 8);
    now = 2000;
    await cached.search("nairobi", 8);

    expect(provider.search).toHaveBeenCalledTimes(2);
  });

  it("doesn't remember a failure", async () => {
    const provider = {
      search: vi.fn<() => Promise<Place[]>>().mockRejectedValueOnce(new Error("down")).mockResolvedValue([PLACE]),
    };
    const cached = new CachedPlaceSearch(provider);

    await expect(cached.search("nairobi", 8)).rejects.toThrow("down");
    await expect(cached.search("nairobi", 8)).resolves.toEqual([PLACE]);
  });

  it("forgets the oldest answer when it's full", async () => {
    const provider = { search: vi.fn(async () => [PLACE]) };
    const cached = new CachedPlaceSearch(provider, 1000, 2);

    await cached.search("a", 8);
    await cached.search("b", 8);
    await cached.search("c", 8);
    await cached.search("a", 8);

    expect(provider.search).toHaveBeenCalledTimes(4);
  });
});
