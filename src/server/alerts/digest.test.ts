import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@prisma/client";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    alert: { findMany: vi.fn(), update: vi.fn() },
    normalizedListing: { findMany: vi.fn() },
    alertNotification: { create: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { runDigest } from "./digest";

const listingMatch = {
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
  titleOriginal: "Mill",
  titleNl: "Molen",
  originalUrl: "https://x",
  city: "Brilon",
  location: { distanceFromVenloKm: 220 },
  score: { compositeScore: 88, matchScore: 85 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runDigest (daily)", () => {
  it("zero alerts → zero work", async () => {
    mockPrisma.alert.findMany.mockResolvedValue([]);
    const r = await runDigest({ frequency: "daily" });
    expect(r.alertsProcessed).toBe(0);
    expect(r.notificationsCreated).toBe(0);
  });

  it("matching alert + matching listing → creates + dispatches one notification", async () => {
    mockPrisma.alert.findMany.mockResolvedValue([
      {
        id: "a1",
        userId: "u1",
        name: "Daily",
        enabled: true,
        channel: "in_app",
        frequency: "daily",
        criteria: { eventTypes: ["new_match"], maxPriceEur: 200_000 },
        lastRunAt: null,
        lastNotifiedIds: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.normalizedListing.findMany.mockResolvedValue([listingMatch]);
    mockPrisma.alertNotification.create.mockResolvedValue({ id: "n1" });
    mockPrisma.alertNotification.update.mockResolvedValue({});
    mockPrisma.alert.update.mockResolvedValue({});

    const r = await runDigest({ frequency: "daily" });
    expect(r.notificationsCreated).toBe(1);
    expect(r.notificationsDispatched).toBe(1);
    // lastRunAt was bumped.
    expect(mockPrisma.alert.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "a1" },
        data: expect.objectContaining({ lastRunAt: expect.any(Date) }),
      }),
    );
  });

  it("listings that don't match criteria are skipped", async () => {
    mockPrisma.alert.findMany.mockResolvedValue([
      {
        id: "a1",
        userId: "u1",
        name: "FR only",
        enabled: true,
        channel: "in_app",
        frequency: "daily",
        criteria: { eventTypes: ["new_match"], country: ["FR"] },
        lastRunAt: null,
        lastNotifiedIds: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.normalizedListing.findMany.mockResolvedValue([listingMatch]); // country=DE
    mockPrisma.alert.update.mockResolvedValue({});

    const r = await runDigest({ frequency: "daily" });
    expect(r.notificationsCreated).toBe(0);
  });

  it("already-notified (P2002 unique) is silently skipped", async () => {
    mockPrisma.alert.findMany.mockResolvedValue([
      {
        id: "a1",
        userId: "u1",
        name: "T",
        enabled: true,
        channel: "in_app",
        frequency: "daily",
        criteria: { eventTypes: ["new_match"] },
        lastRunAt: null,
        lastNotifiedIds: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);
    mockPrisma.normalizedListing.findMany.mockResolvedValue([listingMatch]);
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", {
      code: "P2002",
      clientVersion: "test",
    });
    mockPrisma.alertNotification.create.mockRejectedValue(p2002);
    mockPrisma.alert.update.mockResolvedValue({});

    const r = await runDigest({ frequency: "daily" });
    expect(r.notificationsCreated).toBe(0);
    // No throw.
  });
});
