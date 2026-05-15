import { GeocoderNotImplementedError } from "./errors";
import { haversineMeters, VENLO } from "@/lib/geo";
import type { DrivingDistanceProvider } from "./types";

/**
 * Straight-line distance (haversine) — wrapper around the shared geo
 * helper so the geocoding module doesn't reach across modules for math.
 *
 * NOTE: We rarely call this from app code at runtime; PostGIS computes
 * `distance_from_venlo_km` automatically when lat/lng is written via the
 * trigger in `prisma/sql/postgis_setup.sql`. This helper is used:
 *   - in tests, where we don't have a DB
 *   - for in-memory comparisons / sorts before persistence
 */
export function straightLineDistanceKmFromVenlo(point: {
  lat: number;
  lng: number;
}): number {
  return haversineMeters(VENLO, point) / 1000;
}

/**
 * Default driving-distance provider — null implementation. Returns null for
 * every query so the engine treats driving distance as "not available" and
 * leaves `ListingLocation.distanceDrivingKm` empty.
 *
 * Swap in OsrmDrivingProvider (fase 5+) for real road routing.
 */
export class NullDrivingProvider implements DrivingDistanceProvider {
  readonly name = "null";
  async drivingKm(): Promise<number | null> {
    return null;
  }
}

/**
 * Placeholder for the future OSRM-backed provider. Interface is final.
 * Calling drivingKm() throws so it can't be silently used unconfigured.
 */
export class OsrmDrivingProvider implements DrivingDistanceProvider {
  readonly name = "osrm-stub";
  async drivingKm(): Promise<number | null> {
    throw new GeocoderNotImplementedError(
      "OsrmDrivingProvider is a placeholder. See docs/GEOCODING.md for the recommended OSRM setup.",
    );
  }
}

/**
 * MockDrivingProvider — for tests. Returns a deterministic value from a
 * lookup function. Useful for engine tests that want to verify the
 * driving-distance code path WITHOUT a real router.
 */
export class MockDrivingProvider implements DrivingDistanceProvider {
  readonly name = "mock-driving";
  constructor(
    private readonly lookup: (
      from: { lat: number; lng: number },
      to: { lat: number; lng: number },
    ) => number | null,
  ) {}
  async drivingKm(
    from: { lat: number; lng: number },
    to: { lat: number; lng: number },
  ): Promise<number | null> {
    return this.lookup(from, to);
  }
}
