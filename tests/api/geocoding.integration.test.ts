/**
 * Integration tests for the geocoding endpoints.
 * Skipped without TEST_DATABASE_URL.
 *
 * The geocoder uses a real HTTP transport for Nominatim. To stay offline
 * + deterministic we either:
 *   - test the insufficient-address path (no network call at all), or
 *   - stub global fetch with a canned Nominatim response.
 */
import { it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";
import { POST as listingGeocode } from "@/app/api/listings/[id]/geocode/route";
import { POST as runPending } from "@/app/api/geocoding/run-pending/route";

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

function stubFetch(fixtures: Record<string, { body: string; status?: number }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      const match = Object.keys(fixtures).find((k) => url.startsWith(k));
      if (!match) return new Response("not mocked", { status: 404 });
      const f = fixtures[match]!;
      return new Response(f.body, {
        status: f.status ?? 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

describeIntegration("/api/listings/:id/geocode + /api/geocoding/run-pending", () => {
  withIntegrationDb();

  async function makeAdmin() {
    return getTestPrisma().user.create({
      data: { email: `admin-${Math.random()}@test.local`, role: "admin" },
    });
  }

  async function makeManualSource() {
    return getTestPrisma().source.create({
      data: {
        name: `Manual ${Math.random()}`,
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
  }

  async function makeListing(over: Partial<{
    region: string | null;
    city: string | null;
    postalCode: string | null;
    addressLine: string | null;
  }> = {}) {
    const source = await makeManualSource();
    return getTestPrisma().normalizedListing.create({
      data: {
        sourceId: source.id,
        originalUrl: `internal://test/${Math.random()}`,
        titleOriginal: "Test",
        language: "fr",
        country: "FR",
        isDetached: "yes",
        fingerprint: `fp-${Math.random()}`,
        region: over.region ?? null,
        city: over.city ?? null,
        postalCode: over.postalCode ?? null,
        addressLine: over.addressLine ?? null,
      },
    });
  }

  it("requires admin auth", async () => {
    const listing = await makeListing({ region: "Lorraine" });
    const req = makeRequest("POST", `/api/listings/${listing.id}/geocode`, {});
    const { status } = await invoke(listingGeocode, req, { id: listing.id });
    expect(status).toBe(401);
  });

  it("listing without address fields → status='insufficient_address', no DB write", async () => {
    const admin = await makeAdmin();
    const listing = await makeListing();
    const req = makeRequest("POST", `/api/listings/${listing.id}/geocode`, {
      userId: admin.id,
    });
    const { status, body } = await invoke<{
      status: string;
      lat: number | null;
    }>(listingGeocode, req, { id: listing.id });
    expect(status).toBe(200);
    expect(body.status).toBe("insufficient_address");
    expect(body.lat).toBeNull();
    // No location row written.
    const loc = await getTestPrisma().listingLocation.findUnique({
      where: { normalizedListingId: listing.id },
    });
    expect(loc).toBeNull();
  });

  it("region-only listing falls back to EstimatedRegionProvider with confidence=low", async () => {
    const admin = await makeAdmin();
    const listing = await makeListing({ region: "Lorraine" });
    // Nominatim should NOT be called for region-only — engine falls back
    // to centroid. We stub anyway in case the engine tries.
    stubFetch({ "https://nominatim.openstreetmap.org": { body: "[]" } });

    const req = makeRequest("POST", `/api/listings/${listing.id}/geocode`, {
      userId: admin.id,
    });
    const { status, body } = await invoke<{
      status: string;
      distanceType: string;
      distanceConfidence: string;
      lat: number | null;
    }>(listingGeocode, req, { id: listing.id });
    expect(status).toBe(200);
    expect(body.status).toBe("estimated_from_region");
    expect(body.distanceType).toBe("estimated");
    expect(body.distanceConfidence).toBe("low");
    expect(body.lat).not.toBeNull();

    // ListingLocation row written via PostGIS trigger → distance present.
    const loc = await getTestPrisma().listingLocation.findUnique({
      where: { normalizedListingId: listing.id },
    });
    expect(loc).not.toBeNull();
    expect(loc!.distanceFromVenloKm).toBeGreaterThan(0);
    expect(loc!.distanceConfidence).toBe("low");
    expect(loc!.distanceType).toBe("estimated");
  });

  it("full address with Nominatim mock returns confidence=high", async () => {
    const admin = await makeAdmin();
    const listing = await makeListing({
      addressLine: "1 Rue de la Paix",
      postalCode: "55000",
      city: "Bar-le-Duc",
      region: "Lorraine",
    });
    stubFetch({
      "https://nominatim.openstreetmap.org": {
        body: JSON.stringify([
          {
            lat: "48.7711",
            lon: "5.1606",
            importance: 0.8,
            type: "house",
            addresstype: "house",
            display_name: "1 Rue de la Paix, Bar-le-Duc",
          },
        ]),
      },
    });
    const req = makeRequest("POST", `/api/listings/${listing.id}/geocode`, {
      userId: admin.id,
    });
    const { body } = await invoke<{
      status: string;
      distanceConfidence: string;
      provider: string;
      lat: number | null;
    }>(listingGeocode, req, { id: listing.id });
    expect(body.status).toBe("geocoded");
    expect(body.distanceConfidence).toBe("high");
    expect(body.provider).toBe("nominatim");
    expect(body.lat).toBeCloseTo(48.7711, 3);
  });

  it("run-pending: respects limit + onlyMissing=true (default)", async () => {
    const admin = await makeAdmin();
    // Create 3 listings without location, plus 1 listing WITH location.
    for (let i = 0; i < 3; i++) {
      await makeListing({ region: "Lorraine" });
    }
    const withLoc = await makeListing({ region: "Lorraine" });
    await getTestPrisma().listingLocation.create({
      data: {
        normalizedListingId: withLoc.id,
        lat: 49,
        lng: 6,
        distanceConfidence: "low",
        distanceType: "straight_line",
      },
    });

    const req = makeRequest("POST", "/api/geocoding/run-pending", {
      userId: admin.id,
      body: { limit: 10, onlyMissing: true, delayMs: 0 },
    });
    const { status, body } = await invoke<{
      processed: number;
      estimated: number;
    }>(runPending, req);
    expect(status).toBe(200);
    expect(body.processed).toBe(3); // only the 3 without location
    expect(body.estimated).toBe(3); // region centroids
  });
});
