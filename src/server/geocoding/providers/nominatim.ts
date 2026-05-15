import type { DistanceConfidence } from "@prisma/client";
import { ProviderFetchError } from "../errors";
import type { HttpTransport } from "@/server/connectors";
import type {
  GeocodeQuery,
  GeocodeResult,
  GeocoderProvider,
} from "../types";
import { describeQuery } from "../normalize";

/**
 * NominatimProvider — queries the OpenStreetMap Nominatim service. Free of
 * charge with a strict usage policy:
 *   - 1 request per second, max
 *   - A descriptive User-Agent with contact info
 *   - Cache aggressively (we do, via GeocodeCache)
 *
 * Reference: https://operations.osmfoundation.org/policies/nominatim/
 *
 * The provider uses the structured query endpoint (`?street=...&city=...`)
 * when address components are split out, falling back to the free-text `q=`
 * search otherwise.
 */
export class NominatimProvider implements GeocoderProvider {
  readonly name = "nominatim";

  constructor(
    private readonly transport: HttpTransport,
    private readonly opts: {
      /** Required: app identifier + contact email. */
      userAgent: string;
      /** Base URL — defaults to the public OSM endpoint. */
      baseUrl?: string;
    },
  ) {}

  async geocode(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const base = this.opts.baseUrl ?? "https://nominatim.openstreetmap.org";
    const url = this.buildUrl(base, query);

    let body: string;
    try {
      const res = await this.transport.get(url, {
        timeoutMs: 8_000,
        headers: {
          "User-Agent": this.opts.userAgent,
          // Nominatim recommends Accept-Language hinting for label localisation.
          "Accept-Language": this.acceptLanguageFor(query.country),
        },
      });
      body = res.body;
    } catch (err) {
      throw new ProviderFetchError(
        `Nominatim fetch failed for "${describeQuery(query)}": ${(err as Error).message}`,
        { url, cause: String(err) },
      );
    }

    let parsed: NominatimEntry[];
    try {
      parsed = JSON.parse(body) as NominatimEntry[];
    } catch {
      throw new ProviderFetchError(`Nominatim returned non-JSON for ${url}`, {
        bodyPreview: body.slice(0, 300),
      });
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    // Pick the highest-importance result. Nominatim sorts by `importance`
    // descending already; explicit max-by makes the intent obvious in tests.
    const best = parsed.reduce((a, b) =>
      (a.importance ?? 0) >= (b.importance ?? 0) ? a : b,
    );

    const lat = Number(best.lat);
    const lon = Number(best.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return {
      lat,
      lng: lon,
      accuracy: mapAccuracy(best),
      provider: this.name,
      confidence: mapConfidence(best, query),
      distanceType: "straight_line",
      raw: best,
    };
  }

  private buildUrl(base: string, q: GeocodeQuery): string {
    const sp = new URLSearchParams();
    sp.set("format", "json");
    sp.set("limit", "5");
    sp.set("addressdetails", "1");
    sp.set("countrycodes", q.country.toLowerCase());

    // Prefer structured query — Nominatim returns better results for it.
    if (q.addressLine) sp.set("street", q.addressLine);
    if (q.city) sp.set("city", q.city);
    if (q.region) sp.set("state", q.region);
    if (q.postalCode) sp.set("postalcode", q.postalCode);

    // Free text fallback when nothing structured is set.
    if (!q.addressLine && !q.city && !q.postalCode && q.region) {
      sp.set("q", `${q.region}, ${q.country}`);
    }

    return `${base}/search?${sp.toString()}`;
  }

  private acceptLanguageFor(country: GeocodeQuery["country"]): string {
    return country === "FR"
      ? "fr,nl;q=0.5"
      : country === "DE"
        ? "de,nl;q=0.5"
        : country === "BE"
          ? "nl,fr;q=0.7"
          : "nl";
  }
}

// ---------------------------------------------------------------------------
// Nominatim response shape (only what we use)
// ---------------------------------------------------------------------------

type NominatimEntry = {
  lat: string;
  lon: string;
  importance?: number;
  class?: string;
  type?: string;
  addresstype?: string;
  display_name?: string;
  address?: Record<string, string>;
};

function mapAccuracy(e: NominatimEntry): string {
  const t = e.addresstype ?? e.type ?? "";
  switch (t) {
    case "house":
    case "building":
      return "rooftop";
    case "road":
    case "street":
      return "address";
    case "postcode":
      return "postal_code";
    case "city":
    case "town":
    case "village":
    case "municipality":
      return "city";
    case "state":
    case "county":
    case "region":
      return "region";
    default:
      return t || "unknown";
  }
}

function mapConfidence(
  e: NominatimEntry,
  q: GeocodeQuery,
): DistanceConfidence {
  // Cap the provider's confidence by what the query supports.
  const upper = upperBound(q);
  const provider = providerConfidence(e);
  // Take the min: high beats medium beats low.
  const order: DistanceConfidence[] = ["high", "medium", "low"];
  const upIdx = order.indexOf(upper);
  const prIdx = order.indexOf(provider);
  return order[Math.max(upIdx, prIdx)]!;
}

function providerConfidence(e: NominatimEntry): DistanceConfidence {
  const t = e.addresstype ?? e.type ?? "";
  if (t === "house" || t === "building" || t === "road" || t === "street" || t === "postcode") {
    return "high";
  }
  if (t === "city" || t === "town" || t === "village" || t === "municipality") {
    return "medium";
  }
  return "low";
}

function upperBound(q: GeocodeQuery): DistanceConfidence {
  const hasAddr = !!q.addressLine;
  const hasPostal = !!q.postalCode;
  const hasCity = !!q.city;
  if ((hasAddr && hasCity) || (hasPostal && hasCity) || hasAddr) return "high";
  if (hasCity) return "medium";
  return "low";
}
