import { lookupRegionCentroid } from "../region-centroids";
import type {
  GeocodeQuery,
  GeocodeResult,
  GeocoderProvider,
} from "../types";

/**
 * EstimatedRegionProvider — last-resort fallback. When upstream providers
 * couldn't pin an address, we look the region up in a hand-curated centroid
 * table and return that with confidence=low + distanceType=estimated.
 *
 * The dashboard's distance filter still uses straight-line distance from
 * this centroid; the `low` confidence + `estimated` type are honest about
 * the fuzziness so the UI can badge them ("locatie geschat").
 */
export class EstimatedRegionProvider implements GeocoderProvider {
  readonly name = "estimated_region";

  async geocode(query: GeocodeQuery): Promise<GeocodeResult | null> {
    const c = lookupRegionCentroid(query.country, query.region);
    if (!c) return null;
    return {
      lat: c.lat,
      lng: c.lng,
      accuracy: "region",
      provider: this.name,
      confidence: "low",
      distanceType: "estimated",
      raw: { matchedLabel: c.label },
    };
  }
}
