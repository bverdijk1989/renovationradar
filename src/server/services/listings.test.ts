import { describe, it, expect } from "vitest";
import { buildListingWhere } from "./listings";
import { ListingListQuerySchema } from "../schemas/listings";

function parseQuery(input: Record<string, string | string[] | boolean>) {
  return ListingListQuerySchema.parse(input);
}

describe("buildListingWhere", () => {
  it("returns empty where on empty input", () => {
    const w = buildListingWhere(parseQuery({}));
    // Empty filter -> empty object (defaults don't add filters)
    expect(w).toEqual({});
  });

  it("country: csv string is parsed into an array", () => {
    const w = buildListingWhere(parseQuery({ country: "FR,BE" }));
    expect(w.country).toEqual({ in: ["FR", "BE"] });
  });

  it("min/max price builds a range filter", () => {
    const w = buildListingWhere(
      parseQuery({ minPriceEur: "50000", maxPriceEur: "200000" }),
    );
    expect(w.priceEur).toEqual({ gte: 50000, lte: 200000 });
  });

  it("isSpecialObject=true via string is coerced to boolean", () => {
    const w = buildListingWhere(parseQuery({ isSpecialObject: "true" }));
    expect(w.isSpecialObject).toBe(true);
  });

  it("min/max distance goes through the location relation with `is`", () => {
    const w = buildListingWhere(
      parseQuery({ minDistanceKm: "10", maxDistanceKm: "350" }),
    );
    expect(w.location).toEqual({
      is: { distanceFromVenloKm: { gte: 10, lte: 350 } },
    });
  });

  it("minMatchScore / minCompositeScore go through the score relation", () => {
    const w = buildListingWhere(
      parseQuery({ minMatchScore: "70", minCompositeScore: "80" }),
    );
    expect(w.score).toEqual({
      is: { matchScore: { gte: 70 }, compositeScore: { gte: 80 } },
    });
  });

  it("search builds an OR across title and address fields", () => {
    const w = buildListingWhere(parseQuery({ search: "molen" }));
    expect(Array.isArray(w.OR)).toBe(true);
    expect(w.OR!.length).toBe(4);
    expect(w.OR![0]).toEqual({
      titleNl: { contains: "molen", mode: "insensitive" },
    });
  });

  it("combined filters compose into a single where object", () => {
    const w = buildListingWhere(
      parseQuery({
        country: "DE",
        maxPriceEur: "200000",
        minLandM2: "10000",
        isSpecialObject: "true",
        maxDistanceKm: "350",
        minMatchScore: "60",
        renovationStatus: "needs_renovation,partial_renovation",
      }),
    );
    expect(w.country).toEqual({ in: ["DE"] });
    expect(w.priceEur).toEqual({ lte: 200000 });
    expect(w.landAreaM2).toEqual({ gte: 10000 });
    expect(w.isSpecialObject).toBe(true);
    expect(w.location).toEqual({ is: { distanceFromVenloKm: { lte: 350 } } });
    expect(w.score).toEqual({ is: { matchScore: { gte: 60 } } });
    expect(w.renovationStatus).toEqual({
      in: ["needs_renovation", "partial_renovation"],
    });
  });
});

describe("ListingListQuerySchema", () => {
  it("applies default sort/pagination", () => {
    const q = ListingListQuerySchema.parse({});
    expect(q.sortBy).toBe("composite_score");
    expect(q.sortDir).toBe("desc");
    expect(q.page).toBe(1);
    expect(q.pageSize).toBe(20);
  });

  it("rejects invalid sortBy values", () => {
    expect(() =>
      ListingListQuerySchema.parse({ sortBy: "not_a_field" } as never),
    ).toThrow();
  });

  it("rejects pageSize over the maximum", () => {
    expect(() => ListingListQuerySchema.parse({ pageSize: "1000" })).toThrow();
  });
});
