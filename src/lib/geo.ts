/**
 * Geo helpers. The DB authoritatively computes distance via PostGIS in
 * `listings.distance_from_origin_m` (see prisma/sql/postgis_setup.sql).
 * The helpers here are for the app layer: validating bounding boxes,
 * client-side approximations, and tests.
 */

export const VENLO = Object.freeze({
  lat: 51.3704,
  lng: 6.1724,
  label: "Venlo",
});

export const MAX_RADIUS_KM_DEFAULT = 350;
export const EARTH_RADIUS_M = 6_371_008.8;

/** Haversine distance in meters between two WGS84 points. */
export function haversineMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distance from Venlo in kilometers. */
export function kmFromVenlo(p: { lat: number; lng: number }): number {
  return haversineMeters(VENLO, p) / 1000;
}

/**
 * Rough bounding box around a point for a given radius in km.
 * Use for quick SQL prefilters before a precise ST_Distance check.
 * Latitude degrees are ~111 km; longitude degrees shrink by cos(lat).
 */
export function bboxAround(
  center: { lat: number; lng: number },
  radiusKm: number,
): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  const latDelta = radiusKm / 111;
  const lngDelta =
    radiusKm / (111 * Math.cos((center.lat * Math.PI) / 180) || 1e-6);
  return {
    minLat: center.lat - latDelta,
    maxLat: center.lat + latDelta,
    minLng: center.lng - lngDelta,
    maxLng: center.lng + lngDelta,
  };
}

/** True if point lies within `radiusKm` of `center` (haversine). */
export function withinRadius(
  center: { lat: number; lng: number },
  p: { lat: number; lng: number },
  radiusKm: number,
): boolean {
  return haversineMeters(center, p) / 1000 <= radiusKm;
}
