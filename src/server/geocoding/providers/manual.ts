import type {
  GeocodeQuery,
  GeocodeResult,
  GeocoderProvider,
} from "../types";

/**
 * ManualProvider — for when the admin already knows lat/lng and just wants
 * the geocoder pipeline (cache + distance trigger + audit) to run.
 *
 * Constructor takes a lookup function so tests / API handlers can supply
 * coordinates without round-tripping through Nominatim. In production the
 * /api/listings/manual flow already writes lat/lng directly; this provider
 * exists so re-geocoding such listings still goes through the same pipeline.
 */
export class ManualProvider implements GeocoderProvider {
  readonly name = "manual";
  constructor(
    private readonly lookup: (q: GeocodeQuery) => { lat: number; lng: number } | null,
  ) {}

  async geocode(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const coords = this.lookup(query);
    if (!coords) return null;
    return {
      lat: coords.lat,
      lng: coords.lng,
      accuracy: "manual",
      provider: this.name,
      confidence: "high",
      distanceType: "straight_line",
    };
  }
}
