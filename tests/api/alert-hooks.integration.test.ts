/**
 * Integration tests for the alerts engine's service-path hooks.
 *
 * Verifies that mutations in listings/scoring services actually fire
 * `evaluateListingEvent` and persist AlertNotification rows.
 *
 * Skipped without TEST_DATABASE_URL.
 */
import { it, expect } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";
import { POST as listingsManual } from "@/app/api/listings/manual/route";
import { PATCH as listingPatch } from "@/app/api/listings/[id]/route";

describeIntegration("Alert service-path hooks", () => {
  withIntegrationDb();

  async function setup() {
    const prisma = getTestPrisma();
    const admin = await prisma.user.create({
      data: { email: `admin-${Math.random()}@test.local`, role: "admin" },
    });
    const user = await prisma.user.create({
      data: { email: `u-${Math.random()}@test.local`, role: "user" },
    });
    const source = await prisma.source.create({
      data: {
        name: `Manual ${Math.random()}`,
        country: "FR",
        website: "internal://manual",
        sourceType: "manual",
        collectionMethods: ["manual_entry"],
        status: "active",
        legalStatus: "green",
      },
    });
    return { admin, user, source };
  }

  it("manualCreateListing fires new_match event → AlertNotification row", async () => {
    const { admin, user, source } = await setup();
    const alert = await getTestPrisma().alert.create({
      data: {
        userId: user.id,
        name: "Watermolens FR",
        enabled: true,
        channel: "in_app",
        frequency: "instant",
        criteria: {
          eventTypes: ["new_match"],
          isSpecialObject: true,
          maxPriceEur: 200_000,
        } as never,
      },
    });

    const req = makeRequest("POST", "/api/listings/manual", {
      userId: admin.id,
      body: {
        sourceId: source.id,
        originalUrl: `https://test.fr/${Math.random()}`,
        titleOriginal: "Ancien moulin à eau",
        language: "fr",
        country: "FR",
        isDetached: "yes",
        isSpecialObject: true,
        specialObjectType: "watermill",
        priceEur: 185_000,
        landAreaM2: 12_000,
      },
    });
    const { status, body } = await invoke<{ id: string }>(listingsManual, req);
    expect(status).toBe(201);

    const notifications = await getTestPrisma().alertNotification.findMany({
      where: { alertId: alert.id, normalizedListingId: body.id },
    });
    expect(notifications.length).toBeGreaterThanOrEqual(1);
    // Both new_match and special_object_added events may fire — at minimum
    // new_match must be there.
    const eventTypes = notifications.map((n) => n.eventType);
    expect(eventTypes).toContain("new_match");
    // Instant frequency → status=dispatched after dispatcher runs.
    const newMatch = notifications.find((n) => n.eventType === "new_match");
    expect(newMatch!.status).toBe("dispatched");
  });

  it("manualCreateListing skips alert when criteria don't match", async () => {
    const { admin, user, source } = await setup();
    const alert = await getTestPrisma().alert.create({
      data: {
        userId: user.id,
        name: "DE only",
        enabled: true,
        channel: "in_app",
        frequency: "instant",
        criteria: { eventTypes: ["new_match"], country: ["DE"] } as never,
      },
    });
    const req = makeRequest("POST", "/api/listings/manual", {
      userId: admin.id,
      body: {
        sourceId: source.id,
        originalUrl: `https://test.fr/${Math.random()}`,
        titleOriginal: "FR listing",
        language: "fr",
        country: "FR", // doesn't match alert
        isDetached: "yes",
      },
    });
    await invoke(listingsManual, req);

    const notifications = await getTestPrisma().alertNotification.findMany({
      where: { alertId: alert.id },
    });
    expect(notifications).toHaveLength(0);
  });

  it("patchListing with price decrease fires price_drop event", async () => {
    const { admin, user, source } = await setup();

    // First create a listing.
    const createReq = makeRequest("POST", "/api/listings/manual", {
      userId: admin.id,
      body: {
        sourceId: source.id,
        originalUrl: `https://test.fr/${Math.random()}`,
        titleOriginal: "Te renoveren",
        language: "fr",
        country: "FR",
        isDetached: "yes",
        priceEur: 200_000,
        landAreaM2: 12_000,
      },
    });
    const { body: created } = await invoke<{ id: string }>(listingsManual, createReq);

    // Now set up an alert that only fires on price_drop ≥ 10%.
    const alert = await getTestPrisma().alert.create({
      data: {
        userId: user.id,
        name: "Prijsdaling",
        enabled: true,
        channel: "in_app",
        frequency: "instant",
        criteria: {
          eventTypes: ["price_drop"],
          minPriceDropPercent: 10,
          country: ["FR"],
        } as never,
      },
    });

    // Patch with a 25% drop.
    const patchReq = makeRequest("PATCH", `/api/listings/${created.id}`, {
      userId: admin.id,
      body: { priceEur: 150_000 },
    });
    const { status } = await invoke(listingPatch, patchReq, { id: created.id });
    expect(status).toBe(200);

    const notifications = await getTestPrisma().alertNotification.findMany({
      where: { alertId: alert.id, eventType: "price_drop" },
    });
    expect(notifications).toHaveLength(1);
    const payload = notifications[0]!.payload as Record<string, unknown>;
    expect(payload.dropEur).toBe(50_000);
    expect(payload.dropPercent).toBeCloseTo(25, 1);
  });
});
