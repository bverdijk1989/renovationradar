export {
  geocodeListing,
  geocodePending,
  NominatimProvider,
  EstimatedRegionProvider,
  ManualProvider,
  MockGeocoderProvider,
  GeocodeCache,
  NoopCache,
  NullDrivingProvider,
  OsrmDrivingProvider,
  MockDrivingProvider,
} from "./engine";

export { lookupRegionCentroid } from "./region-centroids";
export {
  describeQuery,
  hashQuery,
  normalisedQueryString,
  queryUpperBoundConfidence,
} from "./normalize";
export { straightLineDistanceKmFromVenlo } from "./distance";

export {
  GeocodingError,
  InsufficientAddressError,
  NotFoundError,
  ProviderFetchError,
  GeocoderNotImplementedError,
} from "./errors";

export type {
  GeocodeQuery,
  GeocodeResult,
  GeocoderProvider,
  GeocodeOutcome,
  BatchGeocodeResult,
  DrivingDistanceProvider,
} from "./types";
export type { GeocodeCacheLike } from "./cache";
