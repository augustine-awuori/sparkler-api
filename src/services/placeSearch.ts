export interface Place {
  /** The place's own name: "Kisii University". */
  name: string;
  /** What a profile shows: "Kisii University, Kisii, Kenya". Fits a profile location. */
  label: string;
  coords: { lat: number; lng: number };
}

/** Where places come from, so another provider can replace this without a client release. */
export interface PlaceSearchProvider {
  search(query: string, limit: number): Promise<Place[]>;
}

const MAX_LABEL = 80;

interface PhotonFeature {
  properties?: {
    name?: unknown;
    street?: unknown;
    city?: unknown;
    state?: unknown;
    country?: unknown;
  };
  geometry?: { coordinates?: unknown };
}

const text = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

/** The most specific parts that fit, dropping from the middle: the country says the most. */
function labelFor(name: string, parts: (string | undefined)[]): string {
  const details = [...new Set(parts.filter((part): part is string => Boolean(part)))].filter(
    (part) => part !== name,
  );
  while (details.length > 0) {
    const label = [name, ...details].join(", ");
    if (label.length <= MAX_LABEL) return label;
    details.splice(0, 1);
  }
  return name;
}

function toPlace({ properties, geometry }: PhotonFeature): Place | null {
  const name = text(properties?.name) ?? text(properties?.street);
  if (!name || name.length > MAX_LABEL) return null;

  const coordinates = geometry?.coordinates;
  if (!Array.isArray(coordinates)) return null;
  const [lng, lat] = coordinates as unknown[];
  if (typeof lat !== "number" || typeof lng !== "number") return null;

  return {
    name,
    label: labelFor(name, [
      text(properties?.city),
      text(properties?.state),
      text(properties?.country),
    ]),
    coords: { lat, lng },
  };
}

/**
 * Photon: OpenStreetMap search built for search-as-you-type, with no key.
 * Nominatim's usage policy forbids autocomplete, which is why it isn't this.
 * https://photon.komoot.io/
 */
export class PhotonPlaceSearch implements PlaceSearchProvider {
  constructor(
    private readonly baseUrl = "https://photon.komoot.io/api",
    private readonly timeoutMs = 4_000,
  ) {}

  async search(query: string, limit: number): Promise<Place[]> {
    const url = `${this.baseUrl}?q=${encodeURIComponent(query)}&limit=${limit}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "sparkler-api" },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!response.ok) throw new Error(`Photon answered ${response.status}`);

    const body = (await response.json()) as { features?: PhotonFeature[] };
    const places = (body.features ?? []).map(toPlace).filter((place) => place !== null);
    return [...new Map(places.map((place) => [place.label, place])).values()];
  }
}

/**
 * Remembers recent answers. Several people type the same few places, and the
 * public Photon server asks for fair use. Failures aren't kept, so one bad
 * moment doesn't stick to a query for the whole window.
 */
export class CachedPlaceSearch implements PlaceSearchProvider {
  private readonly entries = new Map<string, { places: Place[]; expiresAt: number }>();

  constructor(
    private readonly provider: PlaceSearchProvider,
    private readonly ttlMs = 60 * 60 * 1000,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  async search(query: string, limit: number): Promise<Place[]> {
    const key = `${limit}:${query.toLowerCase()}`;
    const cached = this.entries.get(key);
    if (cached && cached.expiresAt > this.now()) return cached.places;

    const places = await this.provider.search(query, limit);

    this.entries.delete(key);
    // Maps iterate oldest first, so this evicts whatever has gone longest unrefreshed.
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { places, expiresAt: this.now() + this.ttlMs });
    return places;
  }
}

export const placeSearch: PlaceSearchProvider = new CachedPlaceSearch(new PhotonPlaceSearch());
