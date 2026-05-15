export abstract class GeocodingError extends Error {
  abstract readonly code: string;
  constructor(message: string, public readonly details?: unknown) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Address has so few fields that even an estimated centroid can't be picked. */
export class InsufficientAddressError extends GeocodingError {
  readonly code = "insufficient_address";
}

/** Provider returned nothing and no region-centroid fallback applies. */
export class NotFoundError extends GeocodingError {
  readonly code = "not_found";
}

/** Provider call failed (network / 5xx / parse error). */
export class ProviderFetchError extends GeocodingError {
  readonly code = "fetch_failed";
}

/** Stub provider invoked. */
export class GeocoderNotImplementedError extends GeocodingError {
  readonly code = "not_implemented";
}
