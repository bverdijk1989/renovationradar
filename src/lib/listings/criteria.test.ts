import { describe, it, expect } from "vitest";
import { DEFAULT_CRITERIA, ListingCriteriaSchema } from "./criteria";

describe("listings/criteria", () => {
  it("defaults match the project brief", () => {
    expect(DEFAULT_CRITERIA.maxPriceEur).toBe(200_000);
    expect(DEFAULT_CRITERIA.minLandM2).toBe(10_000);
    expect(DEFAULT_CRITERIA.countries).toEqual(["FR", "BE", "DE"]);
    expect(DEFAULT_CRITERIA.maxDistanceKm).toBe(350);
    expect(DEFAULT_CRITERIA.requireDetached).toBe(true);
  });

  it("schema produces sane defaults when empty input is supplied", () => {
    const parsed = ListingCriteriaSchema.parse({});
    expect(parsed.maxPriceEur).toBe(200_000);
    expect(parsed.minLandM2).toBe(10_000);
    expect(parsed.countries).toEqual(["FR", "BE", "DE"]);
    expect(parsed.requireDetached).toBe(true);
    expect(parsed.specialObjectsOnly).toBe(false);
  });

  it("schema rejects negative prices and zero land", () => {
    expect(() => ListingCriteriaSchema.parse({ maxPriceEur: -1 })).toThrow();
    expect(() => ListingCriteriaSchema.parse({ minLandM2: 0 })).toThrow();
  });

  it("schema accepts country narrowing to a single country", () => {
    const parsed = ListingCriteriaSchema.parse({ countries: ["DE"] });
    expect(parsed.countries).toEqual(["DE"]);
  });

  it("schema rejects empty countries list", () => {
    expect(() => ListingCriteriaSchema.parse({ countries: [] })).toThrow();
  });
});
