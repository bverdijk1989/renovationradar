/**
 * Integration tests for the /api/listings route family.
 * Skipped automatically if TEST_DATABASE_URL is not set.
 */
import { it, expect } from "vitest";
import type { Country, PropertyType, SpecialObjectType } from "@prisma/client";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";
import { GET as listingsGet } from "@/app/api/listings/route";
import { POST as listingManual } from "@/app/api/listings/manual/route";
import {
  GET as listingGet,
  PATCH as listingPatch,
} from "@/app/api/listings/[id]/route";
import { POST as listingSave } from "@/app/api/listings/[id]/save/route";
import { POST as listingScore } from "@/app/api/listings/[id]/score/route";

describeIntegration("/api/listings", () => {
  withIntegrationDb();

  async function setup(): Promise<{
    adminId: string;
    userId: string;
    manualSourceId: string;
  }> {
    const db = getTestPrisma();
    const admin = await db.user.create({
      data: { email: "admin@test.local", role: "admin" },
    });
    const user = await db.user.create({
      data: { email: "u@test.local", role: "user" },
    });
    const source = await db.source.create({
      data: {
        name: "Manual entry · FR",
        country: "FR",
        website: "internal://manual",
        sourceType: "manual",
        collectionMethods: ["manual_entry"],
        status: "active",
        robotsStatus: "not_applicable",
        termsStatus: "not_applicable",
        legalStatus: "green",
      },
    });
    return { adminId: admin.id, userId: user.id, manualSourceId: source.id };
  }

  async function seedListing(args: {
    sourceId: string;
    country?: Country;
    priceEur?: number;
    landAreaM2?: number;
    isSpecialObject?: boolean;
    specialObjectType?: SpecialObjectType | null;
    propertyType?: PropertyType;
    lat?: number;
    lng?: number;
    title?: string;
  }) {
    return getTestPrisma().normalizedListing.create({
      data: {
        sourceId: args.sourceId,
        originalUrl: `internal://test/${Math.random()}`,
        titleOriginal: args.title ?? "Test",
        language: "fr",
        country: args.country ?? "FR",
        priceEur: args.priceEur ?? 150_000,
        landAreaM2: args.landAreaM2 ?? 12_000,
        propertyType: args.propertyType ?? "farmhouse",
        renovationStatus: "needs_renovation",
        isSpecialObject: args.isSpecialObject ?? false,
        specialObjectType: args.specialObjectType ?? null,
        isDetached: "yes",
        electricityStatus: "present",
        waterStatus: "present",
        availability: "for_sale",
        fingerprint: `fp-${Math.random()}`,
        ...(args.lat !== undefined && args.lng !== undefined
          ? {
              location: {
                create: {
                  lat: args.lat,
                  lng: args.lng,
                  accuracy: "manual",
                  geocoderSource: "manual",
                },
              },
            }
          : {}),
      },
    });
  }

  it("GET /api/listings filters by country", async () => {
    const { manualSourceId } = await setup();
    await seedListing({ sourceId: manualSourceId, country: "FR", lat: 49, lng: 5 });
    await seedListing({ sourceId: manualSourceId, country: "DE", lat: 50, lng: 8 });
    const req = makeRequest("GET", "/api/listings?country=FR");
    const { status, body } = await invoke<{
      data: Array<{ country: string }>;
    }>(listingsGet, req);
    expect(status).toBe(200);
    expect(body.data.every((l) => l.country === "FR")).toBe(true);
  });

  it("GET /api/listings filters by price range + land minimum", async () => {
    const { manualSourceId } = await setup();
    await seedListing({ sourceId: manualSourceId, priceEur: 100_000, landAreaM2: 12_000 });
    await seedListing({ sourceId: manualSourceId, priceEur: 250_000, landAreaM2: 8_000 });
    const req = makeRequest(
      "GET",
      "/api/listings?maxPriceEur=200000&minLandM2=10000",
    );
    const { body } = await invoke<{
      data: Array<{ priceEur: number; landAreaM2: number }>;
    }>(listingsGet, req);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]!.priceEur).toBeLessThanOrEqual(200_000);
    expect(body.data[0]!.landAreaM2).toBeGreaterThanOrEqual(10_000);
  });

  it("GET /api/listings filters by distance from Venlo", async () => {
    const { manualSourceId } = await setup();
    // Trigger fills distance_from_venlo_km from lat/lng.
    await seedListing({ sourceId: manualSourceId, lat: 49.8, lng: 4.75, title: "Near" });
    await seedListing({ sourceId: manualSourceId, lat: 49.65, lng: -1.5, title: "Far" });
    const req = makeRequest("GET", "/api/listings?maxDistanceKm=350");
    const { body } = await invoke<{
      data: Array<{ titleOriginal: string }>;
    }>(listingsGet, req);
    expect(body.data.map((l) => l.titleOriginal)).toContain("Near");
    expect(body.data.map((l) => l.titleOriginal)).not.toContain("Far");
  });

  it("GET /api/listings filters by isSpecialObject=true", async () => {
    const { manualSourceId } = await setup();
    await seedListing({ sourceId: manualSourceId, isSpecialObject: false });
    await seedListing({
      sourceId: manualSourceId,
      isSpecialObject: true,
      specialObjectType: "watermill",
      propertyType: "watermill",
    });
    const req = makeRequest("GET", "/api/listings?isSpecialObject=true");
    const { body } = await invoke<{
      data: Array<{ isSpecialObject: boolean }>;
    }>(listingsGet, req);
    expect(body.data.every((l) => l.isSpecialObject)).toBe(true);
  });

  it("POST /api/listings/manual creates a listing + location", async () => {
    const { adminId, manualSourceId } = await setup();
    const req = makeRequest("POST", "/api/listings/manual", {
      userId: adminId,
      body: {
        sourceId: manualSourceId,
        originalUrl: "https://example.fr/foo",
        titleOriginal: "Longère à rénover",
        language: "fr",
        country: "FR",
        propertyType: "longere",
        renovationStatus: "needs_renovation",
        isDetached: "yes",
        priceEur: 145_000,
        landAreaM2: 12_500,
        electricityStatus: "present",
        waterStatus: "present",
        lat: 49.1,
        lng: 6.1,
      },
    });
    const { status, body } = await invoke<{
      id: string;
      country: string;
      location: { distanceFromVenloKm: number };
    }>(listingManual, req);
    expect(status).toBe(201);
    expect(body.country).toBe("FR");
    expect(body.location.distanceFromVenloKm).toBeGreaterThan(0);
    expect(body.location.distanceFromVenloKm).toBeLessThan(400);
  });

  it("POST /api/listings/manual rejects duplicate fingerprint with 409", async () => {
    const { adminId, manualSourceId } = await setup();
    const payload = {
      sourceId: manualSourceId,
      originalUrl: "https://example.fr/foo",
      titleOriginal: "Test",
      language: "fr",
      country: "FR",
      isDetached: "yes",
      priceEur: 150_000,
      landAreaM2: 12_000,
      addressLine: "1 rue test",
      postalCode: "55000",
    };
    const req1 = makeRequest("POST", "/api/listings/manual", {
      userId: adminId,
      body: payload,
    });
    const { status: s1 } = await invoke(listingManual, req1);
    expect(s1).toBe(201);

    const req2 = makeRequest("POST", "/api/listings/manual", {
      userId: adminId,
      body: { ...payload, originalUrl: "https://example.fr/other" },
    });
    const { status: s2, body: b2 } = await invoke<{ error: { code: string } }>(
      listingManual,
      req2,
    );
    expect(s2).toBe(409);
    expect(b2.error.code).toBe("conflict");
  });

  it("POST /api/listings/manual rejects non-manual source", async () => {
    const { adminId } = await setup();
    const externalSource = await getTestPrisma().source.create({
      data: {
        name: "External",
        country: "FR",
        website: "https://example.com",
        sourceType: "rss",
        collectionMethods: ["rss"],
        status: "active",
        legalStatus: "green",
      },
    });
    const req = makeRequest("POST", "/api/listings/manual", {
      userId: adminId,
      body: {
        sourceId: externalSource.id,
        originalUrl: "https://example.fr/foo",
        titleOriginal: "Test",
        language: "fr",
        country: "FR",
      },
    });
    const { status } = await invoke(listingManual, req);
    expect(status).toBe(400);
  });

  it("PATCH /api/listings/:id updates fields and refreshes location distance", async () => {
    const { adminId, manualSourceId } = await setup();
    const listing = await seedListing({ sourceId: manualSourceId, lat: 49.1, lng: 6.1 });
    const req = makeRequest("PATCH", `/api/listings/${listing.id}`, {
      userId: adminId,
      body: { titleNl: "Geüpdatete titel", lat: 50.5, lng: 5.3 },
    });
    const { status, body } = await invoke<{
      titleNl: string;
      location: { lat: number; distanceFromVenloKm: number };
    }>(listingPatch, req, { id: listing.id });
    expect(status).toBe(200);
    expect(body.titleNl).toBe("Geüpdatete titel");
    expect(body.location.lat).toBeCloseTo(50.5, 1);
  });

  it("POST /api/listings/:id/save creates a SavedListing kind=saved", async () => {
    const { userId, manualSourceId } = await setup();
    const listing = await seedListing({ sourceId: manualSourceId });
    const req = makeRequest("POST", `/api/listings/${listing.id}/save`, {
      userId,
      body: { notes: "Interessant" },
    });
    const { status, body } = await invoke<{ kind: string; notes: string }>(
      listingSave,
      req,
      { id: listing.id },
    );
    expect(status).toBe(200);
    expect(body.kind).toBe("saved");
    expect(body.notes).toBe("Interessant");
  });

  it("POST /api/listings/:id/score writes a ListingScore row", async () => {
    const { adminId, manualSourceId } = await setup();
    const listing = await seedListing({
      sourceId: manualSourceId,
      lat: 49.1,
      lng: 6.1,
      isSpecialObject: true,
      specialObjectType: "watermill",
      propertyType: "watermill",
    });
    const req = makeRequest("POST", `/api/listings/${listing.id}/score`, {
      userId: adminId,
    });
    const { status, body } = await invoke<{
      compositeScore: number;
      specialObjectScore: number;
    }>(listingScore, req, { id: listing.id });
    expect(status).toBe(200);
    expect(body.specialObjectScore).toBe(100);
    expect(body.compositeScore).toBeGreaterThan(0);
  });

  it("GET /api/listings sorts by compositeScore desc when scores exist", async () => {
    const { adminId, manualSourceId } = await setup();
    const high = await seedListing({
      sourceId: manualSourceId,
      lat: 50,
      lng: 5,
      isSpecialObject: true,
      specialObjectType: "watermill",
      propertyType: "watermill",
      title: "High",
    });
    const low = await seedListing({
      sourceId: manualSourceId,
      lat: 50,
      lng: 5,
      title: "Low",
    });
    await invoke(listingScore, makeRequest("POST", `/api/listings/${high.id}/score`, { userId: adminId }), { id: high.id });
    await invoke(listingScore, makeRequest("POST", `/api/listings/${low.id}/score`, { userId: adminId }), { id: low.id });

    const { body } = await invoke<{
      data: Array<{ titleOriginal: string; score: { compositeScore: number } | null }>;
    }>(listingsGet, makeRequest("GET", "/api/listings?sortBy=composite_score&sortDir=desc"));
    expect(body.data[0]!.titleOriginal).toBe("High");
  });

  it("GET /api/listings/:id returns 404 for unknown id", async () => {
    const { status } = await invoke(
      listingGet,
      makeRequest("GET", "/api/listings/00000000-0000-0000-0000-000000000000"),
      { id: "00000000-0000-0000-0000-000000000000" },
    );
    expect(status).toBe(404);
  });
});
