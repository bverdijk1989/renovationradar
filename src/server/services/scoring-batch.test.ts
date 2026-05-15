import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    normalizedListing: { findMany: vi.fn() },
    listingScore: { upsert: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { recalculateAllScores } from "./scoring";

function makeListing(id: string) {
  return {
    id,
    priceEur: 150_000,
    landAreaM2: 12_000,
    livingAreaM2: 140,
    propertyType: "farmhouse",
    renovationStatus: "needs_renovation",
    isSpecialObject: false,
    specialObjectType: null,
    isDetached: "yes",
    electricityStatus: "present",
    waterStatus: "present",
    language: "fr",
    titleOriginal: "Test",
    titleNl: null,
    descriptionOriginal: null,
    descriptionNl: null,
    location: { distanceFromVenloKm: 250 },
    features: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recalculateAllScores (cursor batch)", () => {
  it("returns processed=0 when there are no listings", async () => {
    mockPrisma.normalizedListing.findMany.mockResolvedValue([]);
    const r = await recalculateAllScores();
    expect(r.processed).toBe(0);
  });

  it("walks the dataset in batches via cursor pagination", async () => {
    const batch1 = [makeListing("l1"), makeListing("l2"), makeListing("l3")];
    const batch2 = [makeListing("l4")];
    mockPrisma.normalizedListing.findMany
      .mockResolvedValueOnce(batch1)
      .mockResolvedValueOnce(batch2)
      .mockResolvedValueOnce([]);
    mockPrisma.listingScore.upsert.mockResolvedValue({ compositeScore: 80 });

    const r = await recalculateAllScores({ batchSize: 3 });
    expect(r.processed).toBe(4);
    expect(mockPrisma.listingScore.upsert).toHaveBeenCalledTimes(4);
    // The second findMany call used `cursor: { id: 'l3' }` (last id of batch 1).
    const secondCallArgs = mockPrisma.normalizedListing.findMany.mock.calls[1]![0];
    expect(secondCallArgs.cursor).toEqual({ id: "l3" });
    expect(secondCallArgs.skip).toBe(1);
  });

  it("scopes to listingIds when provided", async () => {
    mockPrisma.normalizedListing.findMany.mockResolvedValue([
      makeListing("l1"),
      makeListing("l2"),
    ]);
    mockPrisma.listingScore.upsert.mockResolvedValue({});
    const r = await recalculateAllScores({ listingIds: ["l1", "l2"] });
    expect(r.processed).toBe(2);
    const args = mockPrisma.normalizedListing.findMany.mock.calls[0]![0];
    expect(args.where).toEqual({ id: { in: ["l1", "l2"] } });
  });

  it("returns the scorerVersion from the active config", async () => {
    mockPrisma.normalizedListing.findMany.mockResolvedValue([]);
    const r = await recalculateAllScores();
    expect(r.scorerVersion).toBeTruthy();
    expect(typeof r.scorerVersion).toBe("string");
  });
});
