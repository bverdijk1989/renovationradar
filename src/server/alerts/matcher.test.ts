import { describe, it, expect } from "vitest";
import type { Alert } from "@prisma/client";
import { match, type ListingForMatching } from "./matcher";
import type { ListingEvent } from "./types";

function makeAlert(criteria: Record<string, unknown>): Alert {
  return {
    id: "a1",
    userId: "u1",
    name: "Test",
    enabled: true,
    channel: "in_app",
    frequency: "instant",
    criteria: { eventTypes: ["new_match"], ...criteria } as never,
    lastRunAt: null,
    lastNotifiedIds: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function makeListing(over: Partial<ListingForMatching> = {}): ListingForMatching {
  return {
    id: "l1",
    sourceId: "s1",
    agencyId: null,
    originalUrl: "https://x",
    titleOriginal: "Watermolen te koop",
    titleNl: "Watermolen te koop",
    descriptionOriginal: null,
    descriptionNl: null,
    language: "nl",
    priceEur: 175_000,
    priceOriginal: null,
    priceCurrency: "EUR",
    propertyType: "watermill",
    renovationStatus: "needs_renovation",
    isSpecialObject: true,
    specialObjectType: "watermill",
    isDetached: "yes",
    landAreaM2: 15_000,
    livingAreaM2: 150,
    rooms: 5,
    electricityStatus: "present",
    waterStatus: "present",
    energyClass: "unknown",
    addressLine: null,
    postalCode: "5500",
    city: "Brilon",
    region: "Sauerland",
    country: "DE",
    availability: "for_sale",
    processingStatus: "scored",
    fingerprint: "fp",
    publishedAt: null,
    firstSeenAt: new Date(),
    lastSeenAt: new Date(),
    archivedAt: null,
    deduplicationGroupId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    location: {
      id: "loc1",
      normalizedListingId: "l1",
      lat: 51.39,
      lng: 8.57,
      location: null,
      distanceFromVenloKm: 220,
      distanceDrivingKm: null,
      distanceType: "straight_line",
      distanceConfidence: "high",
      accuracy: "city",
      geocoderSource: "manual",
      geocodedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    score: {
      normalizedListingId: "l1",
      matchScore: 85,
      renovationScore: 80,
      specialObjectScore: 100,
      dataConfidence: 80,
      investmentPotentialScore: 75,
      compositeScore: 88,
      breakdown: null,
      scoredAt: new Date(),
      scorerVersion: "v2",
    },
    ...over,
  } as never;
}

const newMatchEvent: ListingEvent = { type: "new_match", listingId: "l1" };

describe("matcher — listing criteria", () => {
  it("empty criteria + new_match → matches", () => {
    const r = match(makeAlert({}), makeListing(), newMatchEvent);
    expect(r.matches).toBe(true);
  });

  it("country mismatch → no match", () => {
    const r = match(
      makeAlert({ country: ["FR"] }),
      makeListing(),
      newMatchEvent,
    );
    expect(r.matches).toBe(false);
  });

  it("country match → ok", () => {
    const r = match(
      makeAlert({ country: ["DE", "FR"] }),
      makeListing(),
      newMatchEvent,
    );
    expect(r.matches).toBe(true);
  });

  it("maxPriceEur enforced", () => {
    const r = match(
      makeAlert({ maxPriceEur: 150_000 }),
      makeListing({ priceEur: 175_000 }),
      newMatchEvent,
    );
    expect(r.matches).toBe(false);
  });

  it("minLandM2 enforced", () => {
    const r = match(
      makeAlert({ minLandM2: 20_000 }),
      makeListing({ landAreaM2: 15_000 }),
      newMatchEvent,
    );
    expect(r.matches).toBe(false);
  });

  it("maxDistanceKm enforced via location", () => {
    const r = match(
      makeAlert({ maxDistanceKm: 200 }),
      makeListing(),
      newMatchEvent,
    );
    expect(r.matches).toBe(false);
  });

  it("isSpecialObject=true matches a watermill", () => {
    const r = match(
      makeAlert({ isSpecialObject: true }),
      makeListing(),
      newMatchEvent,
    );
    expect(r.matches).toBe(true);
  });

  it("specialObjectType filter selects only watermill/mill", () => {
    const r = match(
      makeAlert({ specialObjectType: ["watermill", "mill"] }),
      makeListing(),
      newMatchEvent,
    );
    expect(r.matches).toBe(true);
    const r2 = match(
      makeAlert({ specialObjectType: ["lighthouse"] }),
      makeListing(),
      newMatchEvent,
    );
    expect(r2.matches).toBe(false);
  });

  it("renovationStatus filter", () => {
    expect(
      match(
        makeAlert({ renovationStatus: ["needs_renovation"] }),
        makeListing(),
        newMatchEvent,
      ).matches,
    ).toBe(true);
    expect(
      match(
        makeAlert({ renovationStatus: ["move_in_ready"] }),
        makeListing(),
        newMatchEvent,
      ).matches,
    ).toBe(false);
  });

  it("minMatchScore enforced", () => {
    expect(
      match(makeAlert({ minMatchScore: 90 }), makeListing(), newMatchEvent).matches,
    ).toBe(false);
    expect(
      match(makeAlert({ minMatchScore: 80 }), makeListing(), newMatchEvent).matches,
    ).toBe(true);
  });

  it("isDetached filter", () => {
    expect(
      match(
        makeAlert({ isDetached: "no" }),
        makeListing(),
        newMatchEvent,
      ).matches,
    ).toBe(false);
  });

  it("search keyword found", () => {
    expect(
      match(
        makeAlert({ search: "Watermolen" }),
        makeListing(),
        newMatchEvent,
      ).matches,
    ).toBe(true);
    expect(
      match(
        makeAlert({ search: "Pyrenees" }),
        makeListing(),
        newMatchEvent,
      ).matches,
    ).toBe(false);
  });
});

describe("matcher — event subscription", () => {
  it("default eventTypes only fires on new_match", () => {
    const alert = makeAlert({}); // default eventTypes=['new_match']
    const ok = match(alert, makeListing(), { type: "new_match", listingId: "l1" });
    const no = match(alert, makeListing(), {
      type: "price_drop",
      listingId: "l1",
      previousPriceEur: 200_000,
    });
    expect(ok.matches).toBe(true);
    expect(no.matches).toBe(false);
  });

  it("explicit eventTypes=['price_drop'] fires only on price drops", () => {
    const alert = makeAlert({ eventTypes: ["price_drop"] });
    expect(
      match(alert, makeListing(), { type: "new_match", listingId: "l1" }).matches,
    ).toBe(false);
    expect(
      match(alert, makeListing({ priceEur: 175_000 }), {
        type: "price_drop",
        listingId: "l1",
        previousPriceEur: 200_000,
      }).matches,
    ).toBe(true);
  });
});

describe("matcher — price_drop gates", () => {
  const dropAlert = (over: Record<string, unknown> = {}) =>
    makeAlert({ eventTypes: ["price_drop"], ...over });

  it("no actual drop → no match", () => {
    const r = match(dropAlert(), makeListing({ priceEur: 200_000 }), {
      type: "price_drop",
      listingId: "l1",
      previousPriceEur: 200_000,
    });
    expect(r.matches).toBe(false);
  });

  it("minPriceDropEur enforced", () => {
    const r = match(dropAlert({ minPriceDropEur: 10_000 }), makeListing({ priceEur: 195_000 }), {
      type: "price_drop",
      listingId: "l1",
      previousPriceEur: 200_000,
    });
    expect(r.matches).toBe(false);
  });

  it("minPriceDropPercent enforced", () => {
    const r = match(
      dropAlert({ minPriceDropPercent: 10 }),
      makeListing({ priceEur: 195_000 }),
      {
        type: "price_drop",
        listingId: "l1",
        previousPriceEur: 200_000,
      },
    );
    expect(r.matches).toBe(false); // 2.5% < 10%
  });

  it("large drop → matches with payload populated", () => {
    const r = match(dropAlert(), makeListing({ priceEur: 150_000 }), {
      type: "price_drop",
      listingId: "l1",
      previousPriceEur: 200_000,
    });
    expect(r.matches).toBe(true);
    if (r.matches) {
      expect(r.payload.dropEur).toBe(50_000);
      expect(r.payload.dropPercent).toBeCloseTo(25, 1);
    }
  });
});

describe("matcher — score_increased gates", () => {
  it("score actually decreased → no match", () => {
    const alert = makeAlert({ eventTypes: ["score_increased"] });
    const listing = makeListing();
    listing.score!.compositeScore = 80;
    const r = match(alert, listing, {
      type: "score_increased",
      listingId: "l1",
      previousCompositeScore: 90,
    });
    expect(r.matches).toBe(false);
  });

  it("minScoreIncrease enforced", () => {
    const alert = makeAlert({
      eventTypes: ["score_increased"],
      minScoreIncrease: 10,
    });
    const listing = makeListing();
    listing.score!.compositeScore = 88;
    const r = match(alert, listing, {
      type: "score_increased",
      listingId: "l1",
      previousCompositeScore: 85,
    });
    expect(r.matches).toBe(false); // jump=3 < 10
  });
});
