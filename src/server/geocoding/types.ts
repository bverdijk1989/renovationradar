import type {
  Country,
  DistanceConfidence,
  DistanceType,
} from "@prisma/client";

/**
 * What the engine needs to geocode an address. Flat shape so it can be built
 * straight from a NormalizedListing row or a manual API call.
 */
export type GeocodeQuery = {
  country: Country;
  region?: string | null;
  city?: string | null;
  postalCode?: string | null;
  addressLine?: string | null;
};

/**
 * Provider output. Note that `confidence` is the PROVIDER's view — the
 * engine may downgrade it (e.g. from medium → low) if the query lacked
 * postal-code precision regardless of what the provider said.
 *
 * `accuracy` is a free-form provider label ("rooftop", "address",
 * "postal_code", "city", "region", "manual"); kept as string for
 * forward-compat with new providers.
 */
export type GeocodeResult = {
  lat: number;
  lng: number;
  accuracy: string;
  confidence: DistanceConfidence;
  /** Provider name written to ListingLocation.geocoderSource + cache row. */
  provider: string;
  /** Drives ListingLocation.distanceType. Defaults to straight_line. */
  distanceType: DistanceType;
  raw?: unknown;
};

/**
 * Provider contract. Geocoders must be pure of side effects beyond their own
 * cache + network — they MUST NOT touch the listings DB. The engine owns
 * persistence.
 */
export interface GeocoderProvider {
  readonly name: string;
  /** Returns null when the provider has nothing to say for this query. */
  geocode(query: GeocodeQuery): Promise<GeocodeResult | null>;
}

/**
 * Optional secondary provider: road-distance lookup. Stub-default for now;
 * a real impl plugs in OSRM / Mapbox / Google in fase 5+.
 */
export interface DrivingDistanceProvider {
  readonly name: string;
  /** Returns null when no route can be computed. */
  drivingKm(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<number | null>;
}

export type GeocodeOutcome = {
  listingId: string;
  status:
    | "geocoded"
    | "estimated_from_region"
    | "from_cache"
    | "insufficient_address"
    | "not_found"
    | "fetch_failed";
  lat: number | null;
  lng: number | null;
  distanceFromVenloKm: number | null;
  distanceDrivingKm: number | null;
  distanceType: DistanceType;
  distanceConfidence: DistanceConfidence;
  provider: string | null;
  evidence: string;
};

export type BatchGeocodeResult = {
  processed: number;
  succeeded: number;
  fromCache: number;
  estimated: number;
  skipped: number;
  failed: number;
};
