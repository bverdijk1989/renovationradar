import { describe, it, expect } from "vitest";
import { scoreSpecialObject } from "./special";
import { DEFAULT_SCORING_CONFIG } from "./config";
import type { ScoringInput } from "./types";

function input(over: Partial<ScoringInput> = {}): ScoringInput {
  return {
    priceEur: 150_000,
    landAreaM2: 12_000,
    livingAreaM2: 140,
    propertyType: "other",
    renovationStatus: "needs_renovation",
    isSpecialObject: false,
    specialObjectType: null,
    isDetached: "yes",
    electricityStatus: "present",
    waterStatus: "present",
    language: "fr",
    location: { distanceFromVenloKm: 200 },
    titleOriginal: "x",
    ...over,
  };
}

const cfg = DEFAULT_SCORING_CONFIG;

describe("special object score — high for the brief's named types", () => {
  it("watermill = 100", () => {
    const r = scoreSpecialObject(
      input({ isSpecialObject: true, specialObjectType: "watermill" }),
      cfg,
    );
    expect(r.score).toBe(100);
  });

  it("lighthouse = 100", () => {
    const r = scoreSpecialObject(
      input({ isSpecialObject: true, specialObjectType: "lighthouse" }),
      cfg,
    );
    expect(r.score).toBe(100);
  });

  it("mill = 95", () => {
    const r = scoreSpecialObject(
      input({ isSpecialObject: true, specialObjectType: "mill" }),
      cfg,
    );
    expect(r.score).toBe(95);
  });

  it("station_building = 90", () => {
    const r = scoreSpecialObject(
      input({ isSpecialObject: true, specialObjectType: "station_building" }),
      cfg,
    );
    expect(r.score).toBe(90);
  });

  it("lock_keeper_house = 90", () => {
    const r = scoreSpecialObject(
      input({ isSpecialObject: true, specialObjectType: "lock_keeper_house" }),
      cfg,
    );
    expect(r.score).toBe(90);
  });

  it("isSpecialObject=true but no type → 70 (fallback)", () => {
    const r = scoreSpecialObject(input({ isSpecialObject: true }), cfg);
    expect(r.score).toBe(70);
  });

  it("oude boerderij (farmhouse, not special) gets heritage bonus (40)", () => {
    const r = scoreSpecialObject(
      input({ propertyType: "farmhouse", isSpecialObject: false }),
      cfg,
    );
    expect(r.score).toBe(40);
    expect(r.components[0]!.id).toMatch(/heritage\.farmhouse/);
  });

  it("longère gets heritage bonus too", () => {
    const r = scoreSpecialObject(
      input({ propertyType: "longere", isSpecialObject: false }),
      cfg,
    );
    expect(r.score).toBe(40);
  });

  it("plain detached_house → 0", () => {
    const r = scoreSpecialObject(
      input({ propertyType: "detached_house", isSpecialObject: false }),
      cfg,
    );
    expect(r.score).toBe(0);
  });

  it("custom config can lower heritage bonus", () => {
    const r = scoreSpecialObject(input({ propertyType: "farmhouse" }), {
      ...cfg,
      heritagePropertyBonus: 15,
    });
    expect(r.score).toBe(15);
  });
});
