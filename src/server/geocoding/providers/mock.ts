import type {
  GeocodeQuery,
  GeocodeResult,
  GeocoderProvider,
} from "../types";

/**
 * MockProvider — for tests. Returns a deterministic result from a lookup
 * function, or null when the function returns null (simulating "not found").
 */
export class MockProvider implements GeocoderProvider {
  readonly name: string;
  constructor(
    private readonly lookup: (q: GeocodeQuery) => GeocodeResult | null,
    name = "mock",
  ) {
    this.name = name;
  }
  async geocode(query: GeocodeQuery): Promise<GeocodeResult | null> {
    return this.lookup(query);
  }
}
