import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError as ApiNotFoundError } from "../api/http";
import { NominatimProvider } from "./providers/nominatim";
import { EstimatedRegionProvider } from "./providers/estimated-region";
import { GeocodeCache, NoopCache, type GeocodeCacheLike } from "./cache";
import {
  describeQuery,
  queryUpperBoundConfidence,
} from "./normalize";
import { straightLineDistanceKmFromVenlo, NullDrivingProvider } from "./distance";
import { FetchTransport, type HttpTransport } from "@/server/connectors";
import { VENLO } from "@/lib/geo";
import type {
  BatchGeocodeResult,
  DrivingDistanceProvider,
  GeocodeOutcome,
  GeocodeQuery,
  GeocodeResult,
  GeocoderProvider,
} from "./types";

/**
 * Geocoding engine — public entry points.
 *
 *   geocodeListing(listingId)  — fetch + cache + provider + persist for ONE listing
 *   geocodePending()           — batch over listings that lack a ListingLocation
 *
 * Algorithm for a single listing:
 *
 *   1. Build a GeocodeQuery from the listing's address fields.
 *   2. If the query has no useful content → status='insufficient_address'.
 *   3. Try the cache. Hit → write + return (status='from_cache').
 *   4. Compute the query's confidence upper bound. Pick the primary provider.
 *   5. Ask the provider.
 *      - Success → cap confidence at upper bound, persist, return.
 *      - Null result → fall back to EstimatedRegionProvider (centroid).
 *      - Throw → record as 'fetch_failed', cache a negative entry, return.
 *   6. Persist into ListingLocation. The PostGIS trigger fills location +
 *      distance_from_venlo_km automatically on insert/update of lat/lng.
 *      We also call the driving-distance provider (null-default) and write
 *      `distanceDrivingKm` if a value comes back.
 *
 * `geocodePending()` cursors over listings without a ListingLocation row,
 * applying `geocodeListing` to each in sequence (so external rate limits
 * are honoured naturally — Nominatim's 1 req/sec policy is the binding one).
 */

const SUFFICIENT_DELAY_MS_NOMINATIM = 1_100;

type GeocodingDependencies = {
  primary: GeocoderProvider;
  fallback: GeocoderProvider;
  cache: GeocodeCacheLike;
  driving: DrivingDistanceProvider;
};

function defaultDeps(transport?: HttpTransport, userAgent?: string): GeocodingDependencies {
  const tx = transport ?? new FetchTransport();
  const ua =
    userAgent ??
    "RenovationRadar/0.1 (+contact: admin@example.com; geocoding pipeline)";
  return {
    primary: new NominatimProvider(tx, { userAgent: ua }),
    fallback: new EstimatedRegionProvider(),
    cache: new GeocodeCache(),
    driving: new NullDrivingProvider(),
  };
}

export async function geocodeListing(
  listingId: string,
  opts: Partial<GeocodingDependencies> & {
    transport?: HttpTransport;
    userAgent?: string;
  } = {},
): Promise<GeocodeOutcome> {
  const listing = await prisma.normalizedListing.findUnique({
    where: { id: listingId },
    select: {
      id: true,
      country: true,
      region: true,
      city: true,
      postalCode: true,
      addressLine: true,
    },
  });
  if (!listing) throw new ApiNotFoundError("Listing");

  const deps = {
    ...defaultDeps(opts.transport, opts.userAgent),
    ...opts,
  };

  const query: GeocodeQuery = {
    country: listing.country,
    region: listing.region,
    city: listing.city,
    postalCode: listing.postalCode,
    addressLine: listing.addressLine,
  };

  const upper = queryUpperBoundConfidence(query);
  if (upper === "none") {
    return await writeOutcome(listingId, {
      listingId,
      status: "insufficient_address",
      lat: null,
      lng: null,
      distanceFromVenloKm: null,
      distanceDrivingKm: null,
      distanceType: "straight_line",
      distanceConfidence: "low",
      provider: null,
      evidence: "Adres bevat onvoldoende info om te geocoderen (geen stad, postcode of regio).",
    });
  }

  // -------- Cache --------------------------------------------------------
  const cached = await deps.cache.get(query);
  if (cached) {
    const drivingKm = await safeDriving(deps.driving, cached);
    const distanceKm = straightLineDistanceKmFromVenlo({
      lat: cached.lat,
      lng: cached.lng,
    });
    return await writeOutcome(listingId, {
      listingId,
      status: "from_cache",
      lat: cached.lat,
      lng: cached.lng,
      distanceFromVenloKm: round(distanceKm),
      distanceDrivingKm: drivingKm,
      distanceType: cached.distanceType,
      distanceConfidence: capConfidence(cached.confidence, upper),
      provider: `${cached.provider} (cache)`,
      evidence: `Cache hit voor "${describeQuery(query)}" (provider=${cached.provider}, confidence=${cached.confidence}).`,
    });
  }

  // -------- Primary provider --------------------------------------------
  let result: GeocodeResult | null = null;
  let providerEvidence = "";
  try {
    result = await deps.primary.geocode(query);
    providerEvidence = `${deps.primary.name}: ${result ? "match" : "geen resultaat"}`;
  } catch (err) {
    providerEvidence = `${deps.primary.name} faalde: ${(err as Error).message}`;
    // Cache a negative entry so we don't hammer a broken provider for the
    // same dud address on every batch run.
    await deps.cache.set(query, null);
    return await writeOutcome(listingId, {
      listingId,
      status: "fetch_failed",
      lat: null,
      lng: null,
      distanceFromVenloKm: null,
      distanceDrivingKm: null,
      distanceType: "straight_line",
      distanceConfidence: "low",
      provider: deps.primary.name,
      evidence: providerEvidence,
    });
  }

  // -------- Fallback to region centroid ---------------------------------
  if (!result) {
    const estimated = await deps.fallback.geocode(query);
    if (!estimated) {
      await deps.cache.set(query, null);
      return await writeOutcome(listingId, {
        listingId,
        status: "not_found",
        lat: null,
        lng: null,
        distanceFromVenloKm: null,
        distanceDrivingKm: null,
        distanceType: "straight_line",
        distanceConfidence: "low",
        provider: null,
        evidence: `${providerEvidence}; geen regio-centroïde-fallback beschikbaar.`,
      });
    }
    result = estimated;
    providerEvidence = `${providerEvidence}; fallback ${deps.fallback.name} → centroïde (confidence=low).`;
  }

  await deps.cache.set(query, result);

  const drivingKm = await safeDriving(deps.driving, result);
  const distanceKm = straightLineDistanceKmFromVenlo({
    lat: result.lat,
    lng: result.lng,
  });
  return await writeOutcome(listingId, {
    listingId,
    status: result.provider === "estimated_region" ? "estimated_from_region" : "geocoded",
    lat: result.lat,
    lng: result.lng,
    distanceFromVenloKm: round(distanceKm),
    distanceDrivingKm: drivingKm,
    distanceType: result.distanceType,
    distanceConfidence: capConfidence(result.confidence, upper),
    provider: result.provider,
    evidence: `${providerEvidence}. Bron-confidence=${result.confidence}, accuracy=${result.accuracy}, capped door query op ${upper}.`,
  });
}

// ---------------------------------------------------------------------------
// Batch
// ---------------------------------------------------------------------------

export async function geocodePending(
  opts: {
    limit?: number;
    onlyMissing?: boolean;
    delayMs?: number;
    transport?: HttpTransport;
    userAgent?: string;
  } = {},
): Promise<BatchGeocodeResult> {
  const limit = opts.limit ?? 100;
  const delay = opts.delayMs ?? SUFFICIENT_DELAY_MS_NOMINATIM;

  // Default: only listings without a ListingLocation row.
  const where: Prisma.NormalizedListingWhereInput =
    opts.onlyMissing === false
      ? {}
      : { location: { is: null } };

  const targets = await prisma.normalizedListing.findMany({
    where,
    select: { id: true },
    take: limit,
    orderBy: { id: "asc" },
  });

  const result: BatchGeocodeResult = {
    processed: 0,
    succeeded: 0,
    fromCache: 0,
    estimated: 0,
    skipped: 0,
    failed: 0,
  };

  for (const t of targets) {
    const outcome = await geocodeListing(t.id, {
      transport: opts.transport,
      userAgent: opts.userAgent,
    });
    result.processed += 1;
    switch (outcome.status) {
      case "geocoded":
        result.succeeded += 1;
        break;
      case "from_cache":
        result.fromCache += 1;
        break;
      case "estimated_from_region":
        result.estimated += 1;
        break;
      case "insufficient_address":
      case "not_found":
        result.skipped += 1;
        break;
      case "fetch_failed":
        result.failed += 1;
        break;
    }
    // Respect external rate limits when actually hitting the network.
    if (outcome.status === "geocoded" || outcome.status === "estimated_from_region") {
      await sleep(delay);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function writeOutcome(listingId: string, outcome: GeocodeOutcome): Promise<GeocodeOutcome> {
  if (outcome.lat == null || outcome.lng == null) {
    // No coordinates → don't write/update ListingLocation (trigger would
    // clear distance_from_venlo_km, which is fine, but we keep the row
    // absent so the batch query still picks it up next time the address
    // improves).
    return outcome;
  }
  await prisma.listingLocation.upsert({
    where: { normalizedListingId: listingId },
    create: {
      normalizedListingId: listingId,
      lat: outcome.lat,
      lng: outcome.lng,
      accuracy: outcome.provider ?? "unknown",
      geocoderSource: outcome.provider,
      geocodedAt: new Date(),
      distanceDrivingKm: outcome.distanceDrivingKm,
      distanceType: outcome.distanceType,
      distanceConfidence: outcome.distanceConfidence,
    },
    update: {
      lat: outcome.lat,
      lng: outcome.lng,
      accuracy: outcome.provider ?? "unknown",
      geocoderSource: outcome.provider,
      geocodedAt: new Date(),
      distanceDrivingKm: outcome.distanceDrivingKm,
      distanceType: outcome.distanceType,
      distanceConfidence: outcome.distanceConfidence,
    },
  });
  return outcome;
}

async function safeDriving(
  provider: DrivingDistanceProvider,
  point: { lat: number; lng: number },
): Promise<number | null> {
  try {
    return await provider.drivingKm(VENLO, point);
  } catch {
    // Driving is optional; never let it sink the whole geocode.
    return null;
  }
}

function capConfidence(
  provider: GeocodeResult["confidence"],
  upper: "high" | "medium" | "low",
): GeocodeResult["confidence"] {
  if (upper === "low") return "low";
  if (upper === "medium" && provider === "high") return "medium";
  return provider;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Re-exports for `import { ... } from "@/server/geocoding"`.
export { NominatimProvider, EstimatedRegionProvider };
export { GeocodeCache, NoopCache };
export { NullDrivingProvider, OsrmDrivingProvider, MockDrivingProvider } from "./distance";
export { MockProvider as MockGeocoderProvider } from "./providers/mock";
export { ManualProvider } from "./providers/manual";
export type {
  GeocodeQuery,
  GeocodeResult,
  GeocoderProvider,
  GeocodeOutcome,
  BatchGeocodeResult,
  DrivingDistanceProvider,
} from "./types";
