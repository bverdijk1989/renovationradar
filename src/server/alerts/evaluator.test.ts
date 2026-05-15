import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    normalizedListing: { findUnique: vi.fn() },
    alert: { findMany: vi.fn() },
    alertNotification: { create: vi.fn(), update: vi.fn(), findMany: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { evaluateListingEvent } from "./evaluator";
import { Dispatcher } from "./delivery/dispatcher";

const listing = {
  id: "l1",
  country: "DE",
  priceEur: 175_000,
  landAreaM2: 15_000,
  propertyType: "watermill",
  renovationStatus: "needs_renovation",
  isSpecialObject: true,
  specialObjectType: "watermill",
  isDetached: "yes",
  electricityStatus: "present",
  waterStatus: "present",
  availability: "for_sale",
  titleOriginal: "Watermolen",
  titleNl: "Watermolen",
  originalUrl: "https://x",
  city: "Brilon",
  location: { distanceFromVenloKm: 220 },
  score: { compositeScore: 88, matchScore: 85 },
};

function alertRow(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    userId: "u1",
    name: "Test",
    enabled: true,
    channel: "in_app",
    frequency: "instant",
    criteria: { eventTypes: ["new_match"] },
    lastRunAt: null,
    lastNotifiedIds: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("evaluateListingEvent", () => {
  it("listing not found → empty summary", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(null);
    const r = await evaluateListingEvent({ type: "new_match", listingId: "x" });
    expect(r.evaluatedAlerts).toBe(0);
    expect(r.matched).toBe(0);
  });

  it("no alerts → 0 matched, no notifications created", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listing);
    mockPrisma.alert.findMany.mockResolvedValue([]);
    const r = await evaluateListingEvent({ type: "new_match", listingId: "l1" });
    expect(r.matched).toBe(0);
    expect(mockPrisma.alertNotification.create).not.toHaveBeenCalled();
  });

  it("matching alert creates a notification + dispatches when instant", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listing);
    mockPrisma.alert.findMany.mockResolvedValue([
      alertRow({ criteria: { eventTypes: ["new_match"], maxPriceEur: 200_000 } }),
    ]);
    mockPrisma.alertNotification.create.mockResolvedValue({ id: "n1" });
    mockPrisma.alertNotification.update.mockResolvedValue({});

    // Dispatcher will read this row when invoked.
    const dispatcher = new Dispatcher();
    const r = await evaluateListingEvent(
      { type: "new_match", listingId: "l1" },
      { dispatcher },
    );
    expect(r.matched).toBe(1);
    expect(r.created).toBe(1);
    expect(r.dispatched).toBe(1);
    expect(mockPrisma.alertNotification.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.alertNotification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "dispatched" }),
      }),
    );
  });

  it("daily-frequency alert: row created but NOT dispatched", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listing);
    mockPrisma.alert.findMany.mockResolvedValue([
      alertRow({
        frequency: "daily",
        criteria: { eventTypes: ["new_match"] },
      }),
    ]);
    mockPrisma.alertNotification.create.mockResolvedValue({ id: "n1" });

    const r = await evaluateListingEvent({ type: "new_match", listingId: "l1" });
    expect(r.created).toBe(1);
    expect(r.dispatched).toBe(0);
    expect(mockPrisma.alertNotification.update).not.toHaveBeenCalled();
  });

  it("P2002 unique violation → counted as duplicate, not error", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue(listing);
    mockPrisma.alert.findMany.mockResolvedValue([alertRow()]);
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
    });
    mockPrisma.alertNotification.create.mockRejectedValue(p2002);

    const r = await evaluateListingEvent({ type: "new_match", listingId: "l1" });
    expect(r.matched).toBe(1);
    expect(r.created).toBe(0);
    expect(r.skippedDuplicates).toBe(1);
  });

  it("non-matching listing (price too high) → no notification", async () => {
    mockPrisma.normalizedListing.findUnique.mockResolvedValue({
      ...listing,
      priceEur: 500_000,
    });
    mockPrisma.alert.findMany.mockResolvedValue([
      alertRow({ criteria: { eventTypes: ["new_match"], maxPriceEur: 200_000 } }),
    ]);
    const r = await evaluateListingEvent({ type: "new_match", listingId: "l1" });
    expect(r.matched).toBe(0);
    expect(mockPrisma.alertNotification.create).not.toHaveBeenCalled();
  });
});
