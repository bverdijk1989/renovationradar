/**
 * Static validation of seed data. These tests pass without a database — they
 * only check that the seed input matches the brief's contract:
 *
 *   - Every keyword from the brief is represented in at least one profile.
 *   - Every seeded source has a defensible legal status:
 *       * sources with status=active must be manual_entry only.
 *       * every external source ships as status=pending_review.
 *   - The listing seed has ≥10 entries spread across FR/BE/DE, with
 *     special objects and at least one outside the 350 km Venlo radius.
 */
import { describe, it, expect } from "vitest";
import { searchProfileSeeds } from "../prisma/data/search-profiles";
import { sourceSeeds } from "../prisma/data/sources";
import { listingSeeds, agencySeeds } from "../prisma/data/listings";
import { kmFromVenlo } from "../src/lib/geo";

const REQUIRED_FR_TERMS = [
  "maison à rénover",
  "ferme à rénover",
  "corps de ferme",
  "maison individuelle",
  "maison isolée",
  "longère",
  "moulin à vendre",
  "ancien moulin",
  "moulin à eau",
  "ancienne gare",
  "maison éclusière",
  "maison de garde-barrière",
  "terrain 1 hectare",
  "terrain 10000 m²",
  "maison avec terrain",
  "grange à rénover",
  "propriété rurale",
];

const REQUIRED_BE_NL_TERMS = [
  "opknapwoning",
  "renovatiewoning",
  "te renoveren woning",
  "vrijstaande woning",
  "hoeve te koop",
  "boerderij te koop",
  "watermolen te koop",
  "molen te koop",
  "sluiswachterswoning",
  "stationsgebouw te koop",
  "woning met 1 hectare grond",
  "woning met 10000 m² grond",
];

const REQUIRED_BE_FR_TERMS = [
  "maison à rénover",
  "ferme à rénover",
  "maison 4 façades",
  "moulin à vendre",
  "ancienne gare",
  "maison éclusière",
];

const REQUIRED_DE_TERMS = [
  "renovierungsbedürftiges Haus",
  "sanierungsbedürftiges Haus",
  "freistehendes Haus",
  "Bauernhaus",
  "Resthof",
  "Landhaus",
  "Mühle kaufen",
  "Wassermühle kaufen",
  "Bahnhofsgebäude kaufen",
  "Schleusenwärterhaus",
  "Haus mit Grundstück",
  "Haus mit 10000 m² Grundstück",
  "Haus mit 1 ha Grundstück",
  "Alleinlage",
  "Außenbereich",
];

function termsFor(country: "FR" | "BE" | "DE", language: "fr" | "nl" | "de") {
  return searchProfileSeeds
    .filter((p) => p.country === country && p.language === language)
    .flatMap((p) => p.terms);
}

describe("seed: search profiles cover brief", () => {
  it("FR · fr profiles contain every required FR term", () => {
    const have = new Set(termsFor("FR", "fr"));
    const missing = REQUIRED_FR_TERMS.filter((t) => !have.has(t));
    expect(missing).toEqual([]);
  });

  it("BE · nl profiles contain every required BE-NL term", () => {
    const have = new Set(termsFor("BE", "nl"));
    const missing = REQUIRED_BE_NL_TERMS.filter((t) => !have.has(t));
    expect(missing).toEqual([]);
  });

  it("BE · fr profiles contain every required BE-FR term", () => {
    const have = new Set(termsFor("BE", "fr"));
    const missing = REQUIRED_BE_FR_TERMS.filter((t) => !have.has(t));
    expect(missing).toEqual([]);
  });

  it("DE · de profiles contain every required DE term", () => {
    const have = new Set(termsFor("DE", "de"));
    const missing = REQUIRED_DE_TERMS.filter((t) => !have.has(t));
    expect(missing).toEqual([]);
  });

  it("every profile has at least one term and a valid category", () => {
    for (const p of searchProfileSeeds) {
      expect(p.terms.length).toBeGreaterThan(0);
      expect([
        "general",
        "rural",
        "land",
        "special_object",
        "detached",
      ]).toContain(p.category);
    }
  });

  it("profile names are unique", () => {
    const names = searchProfileSeeds.map((p) => p.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("seed: sources stay on the right side of legal", () => {
  it("only manual_entry sources may be active on first seed", () => {
    for (const s of sourceSeeds) {
      if (s.status === "active") {
        expect(s.collectionMethods).toEqual(["manual_entry"]);
        expect(s.legalStatus).toBe("green");
      }
    }
  });

  it("every external source ships as pending_review or stricter", () => {
    for (const s of sourceSeeds) {
      const isExternal = !s.collectionMethods.every(
        (m) => m === "manual_entry" || m === "email_inbox",
      );
      if (isExternal) {
        expect(["pending_review", "blocked", "retired"]).toContain(s.status);
        expect(["pending_review", "amber", "red"]).toContain(s.legalStatus);
      }
    }
  });

  it("source seedKeys are unique", () => {
    const keys = sourceSeeds.map((s) => s.seedKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("seed: test listings", () => {
  it("has at least 10 listings", () => {
    expect(listingSeeds.length).toBeGreaterThanOrEqual(10);
  });

  it("covers all three target countries (FR, BE, DE)", () => {
    const countries = new Set(listingSeeds.map((l) => l.country));
    expect(countries.has("FR")).toBe(true);
    expect(countries.has("BE")).toBe(true);
    expect(countries.has("DE")).toBe(true);
  });

  it("contains at least one listing of each special object type used", () => {
    const specials = listingSeeds.filter((l) => l.isSpecialObject);
    expect(specials.length).toBeGreaterThanOrEqual(4);
    const types = new Set(specials.map((l) => l.specialObjectType));
    expect(types.has("watermill")).toBe(true);
    expect(types.has("station_building")).toBe(true);
    expect(types.has("lock_keeper_house")).toBe(true);
  });

  it("at least one listing is outside the 350 km Venlo radius (for filter testing)", () => {
    const outside = listingSeeds.filter(
      (l) => kmFromVenlo({ lat: l.lat, lng: l.lng }) > 350,
    );
    expect(outside.length).toBeGreaterThanOrEqual(1);
  });

  it("the majority of listings are within the 350 km Venlo radius", () => {
    const inside = listingSeeds.filter(
      (l) => kmFromVenlo({ lat: l.lat, lng: l.lng }) <= 350,
    );
    expect(inside.length).toBeGreaterThanOrEqual(10);
  });

  it("listing seedKeys are unique", () => {
    const keys = listingSeeds.map((l) => l.seedKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every listing's sourceKey resolves to a seeded source", () => {
    const sourceKeys = new Set(sourceSeeds.map((s) => s.seedKey));
    for (const l of listingSeeds) {
      expect(sourceKeys.has(l.sourceKey)).toBe(true);
    }
  });

  it("every listing's agencyKey (when set) resolves to a seeded agency", () => {
    const agencyKeys = new Set(agencySeeds.map((a) => a.seedKey));
    for (const l of listingSeeds) {
      if (l.agencyKey) {
        expect(agencyKeys.has(l.agencyKey)).toBe(true);
      }
    }
  });

  it("every listing satisfies the brief's hard criteria (price ≤ 200k, land ≥ 10k, detached)", () => {
    for (const l of listingSeeds) {
      expect(l.priceEur).toBeLessThanOrEqual(200_000);
      expect(l.landAreaM2).toBeGreaterThanOrEqual(10_000);
      expect(l.isDetached).toBe("yes");
    }
  });

  it("score components stay in 0..100", () => {
    for (const l of listingSeeds) {
      for (const v of Object.values(l.score)) {
        if (typeof v === "number") {
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});
