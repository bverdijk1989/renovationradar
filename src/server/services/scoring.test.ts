import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Service-layer smoke tests. Detailed scoring-logic tests live in
 * `src/server/scoring/*.test.ts` against the pure engine. Here we only
 * check that the service:
 *   - reads the listing + location + features from Prisma
 *   - persists a ListingScore upsert
 *   - bumps processingStatus to 'scored'
 */
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    normalizedListing: {
      findUnique: vi.fn(),
      update: vi.fn(),
      findMany: vi.fn(),
    },
    listingScore: { upsert: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { scoreListingById } from "./scoring";
import { NotFoundError } from "../api/http";

function listingFixture(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
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
    titleOriginal: "Ferme à rénover",
    titleNl: null,
    descriptionOriginal: null,
    descriptionNl: null,
    location: { distanceFromVenloKm: 250 },
    features: [],
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("scoreListingById (service)", () => {
  it("throws NotFoundError when the listing does not exist", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(null);
    await expect(scoreListingById("nope")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("upserts a ListingScore row + bumps processingStatus to scored", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listingFixture());
    mockPrisma.listingScore.upsert.mockResolvedValue({ compositeScore: 80 });
    mockPrisma.normalizedListing.update.mockResolvedValue({ id: "l1" });

    await scoreListingById("l1");

    expect(mockPrisma.listingScore.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = mockPrisma.listingScore.upsert.mock.calls[0]![0];
    expect(upsertArgs.where).toEqual({ normalizedListingId: "l1" });
    expect(upsertArgs.create.scorerVersion).toBeTruthy();
    expect(typeof upsertArgs.create.matchScore).toBe("number");

    expect(mockPrisma.normalizedListing.update).toHaveBeenCalledWith({
      where: { id: "l1" },
      data: { processingStatus: "scored" },
    });
  });

  it("passes through _normalization_confidence feature when present", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(
      listingFixture({
        features: [
          { id: "f", key: "_normalization_confidence", valueNumber: 85, valueString: null, valueBool: null, confidence: 1, source: "manual" },
        ],
      }),
    );
    mockPrisma.listingScore.upsert.mockResolvedValue({});
    mockPrisma.normalizedListing.update.mockResolvedValue({});

    await scoreListingById("l1");
    const args = mockPrisma.listingScore.upsert.mock.calls[0]![0];
    // dataConfidence should equal the passed-in 85 (engine trusts it verbatim).
    expect(args.create.dataConfidence).toBe(85);
  });
});
