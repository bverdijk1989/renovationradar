import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock Prisma before engine import.
// ---------------------------------------------------------------------------
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    normalizedListing: { findUnique: vi.fn(), findMany: vi.fn() },
    listingLocation: { upsert: vi.fn() },
    geocodeCache: { findUnique: vi.fn(), update: vi.fn(), upsert: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { geocodeListing, NoopCache, MockGeocoderProvider } from "./engine";
import { EstimatedRegionProvider } from "./providers/estimated-region";
import { NullDrivingProvider } from "./distance";

function listingFixture(over: Record<string, unknown> = {}) {
  return {
    id: "l1",
    country: "FR",
    region: "Lorraine",
    city: "Bar-le-Duc",
    postalCode: "55000",
    addressLine: "Lieu-dit Le Verger",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("geocodeListing — pipeline", () => {
  it("insufficient address → no location upsert, status=insufficient_address", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(
      listingFixture({
        region: null,
        city: null,
        postalCode: null,
        addressLine: null,
      }),
    );
    const outcome = await geocodeListing("l1", {
      cache: new NoopCache(),
      primary: new MockGeocoderProvider(() => null),
      fallback: new EstimatedRegionProvider(),
      driving: new NullDrivingProvider(),
    });
    expect(outcome.status).toBe("insufficient_address");
    expect(mockPrisma.listingLocation.upsert).not.toHaveBeenCalled();
  });

  it("primary provider returns a rooftop hit → status=geocoded + high confidence", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listingFixture());
    mockPrisma.listingLocation.upsert.mockResolvedValue({});

    const outcome = await geocodeListing("l1", {
      cache: new NoopCache(),
      primary: new MockGeocoderProvider(() => ({
        lat: 49.1,
        lng: 6.1,
        accuracy: "rooftop",
        provider: "mock",
        confidence: "high",
        distanceType: "straight_line",
      })),
      fallback: new EstimatedRegionProvider(),
      driving: new NullDrivingProvider(),
    });
    expect(outcome.status).toBe("geocoded");
    expect(outcome.distanceConfidence).toBe("high");
    expect(outcome.distanceType).toBe("straight_line");
    expect(outcome.lat).toBeCloseTo(49.1, 4);
    expect(outcome.distanceFromVenloKm).toBeGreaterThan(200);
    expect(outcome.distanceFromVenloKm).toBeLessThan(300);
    expect(mockPrisma.listingLocation.upsert).toHaveBeenCalledTimes(1);
  });

  it("provider returns null → falls back to region centroid (estimated, low)", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(
      listingFixture({ city: null, postalCode: null, addressLine: null }),
    );
    mockPrisma.listingLocation.upsert.mockResolvedValue({});

    const outcome = await geocodeListing("l1", {
      cache: new NoopCache(),
      primary: new MockGeocoderProvider(() => null),
      fallback: new EstimatedRegionProvider(),
      driving: new NullDrivingProvider(),
    });
    expect(outcome.status).toBe("estimated_from_region");
    expect(outcome.distanceType).toBe("estimated");
    expect(outcome.distanceConfidence).toBe("low");
    expect(outcome.provider).toBe("estimated_region");
  });

  it("provider throws → status=fetch_failed, negative cache written, no location upsert", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listingFixture());

    const cacheSet = vi.fn().mockResolvedValue(undefined);
    const outcome = await geocodeListing("l1", {
      cache: {
        get: async () => null,
        set: cacheSet,
      },
      primary: new MockGeocoderProvider(() => {
        throw new Error("network exploded");
      }),
      fallback: new EstimatedRegionProvider(),
      driving: new NullDrivingProvider(),
    });
    expect(outcome.status).toBe("fetch_failed");
    expect(outcome.evidence).toMatch(/network exploded/);
    expect(cacheSet).toHaveBeenCalledTimes(1);
    expect(cacheSet.mock.calls[0]![1]).toBeNull(); // negative cache
    expect(mockPrisma.listingLocation.upsert).not.toHaveBeenCalled();
  });

  it("cache hit short-circuits the provider", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listingFixture());
    mockPrisma.listingLocation.upsert.mockResolvedValue({});

    const primaryGeocode = vi.fn();
    const outcome = await geocodeListing("l1", {
      cache: {
        get: async () => ({
          lat: 49.0,
          lng: 6.0,
          accuracy: "address",
          provider: "nominatim",
          confidence: "high",
          distanceType: "straight_line",
        }),
        set: async () => {},
      },
      primary: { name: "mock", geocode: primaryGeocode } as never,
      fallback: new EstimatedRegionProvider(),
      driving: new NullDrivingProvider(),
    });
    expect(outcome.status).toBe("from_cache");
    expect(primaryGeocode).not.toHaveBeenCalled();
    expect(outcome.provider).toMatch(/nominatim.*cache/);
  });

  it("confidence is capped by query upper-bound (city-only → max medium)", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(
      listingFixture({
        addressLine: null,
        postalCode: null,
      }),
    );
    mockPrisma.listingLocation.upsert.mockResolvedValue({});

    const outcome = await geocodeListing("l1", {
      cache: new NoopCache(),
      primary: new MockGeocoderProvider(() => ({
        lat: 49.1,
        lng: 6.1,
        accuracy: "city",
        provider: "mock",
        confidence: "high", // provider lies — should be capped.
        distanceType: "straight_line",
      })),
      fallback: new EstimatedRegionProvider(),
      driving: new NullDrivingProvider(),
    });
    expect(outcome.distanceConfidence).toBe("medium");
  });

  it("driving distance is written when the driving provider returns a value", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listingFixture());
    mockPrisma.listingLocation.upsert.mockResolvedValue({});

    const outcome = await geocodeListing("l1", {
      cache: new NoopCache(),
      primary: new MockGeocoderProvider(() => ({
        lat: 49.1,
        lng: 6.1,
        accuracy: "address",
        provider: "mock",
        confidence: "high",
        distanceType: "straight_line",
      })),
      fallback: new EstimatedRegionProvider(),
      driving: {
        name: "mock-driving",
        async drivingKm() {
          return 312;
        },
      },
    });
    expect(outcome.distanceDrivingKm).toBe(312);
    const upsertArgs = mockPrisma.listingLocation.upsert.mock.calls[0]![0];
    expect(upsertArgs.create.distanceDrivingKm).toBe(312);
  });

  it("driving provider failure does not sink the geocode", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listingFixture());
    mockPrisma.listingLocation.upsert.mockResolvedValue({});

    const outcome = await geocodeListing("l1", {
      cache: new NoopCache(),
      primary: new MockGeocoderProvider(() => ({
        lat: 49.1,
        lng: 6.1,
        accuracy: "address",
        provider: "mock",
        confidence: "high",
        distanceType: "straight_line",
      })),
      fallback: new EstimatedRegionProvider(),
      driving: {
        name: "broken",
        async drivingKm() {
          throw new Error("OSRM unreachable");
        },
      },
    });
    expect(outcome.status).toBe("geocoded");
    expect(outcome.distanceDrivingKm).toBeNull();
  });
});
