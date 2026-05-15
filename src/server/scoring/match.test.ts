import { describe, it, expect } from "vitest";
import { scoreMatch } from "./match";
import { DEFAULT_SCORING_CONFIG } from "./config";
import type { ScoringInput } from "./types";

function input(over: Partial<ScoringInput> = {}): ScoringInput {
  return {
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
    location: { distanceFromVenloKm: 200 },
    titleOriginal: "Ferme",
    ...over,
  };
}

const cfg = DEFAULT_SCORING_CONFIG;

describe("match score — per-component point allocations match the brief", () => {
  it("perfect listing → 100 (all 8 components fire at max)", () => {
    const r = scoreMatch(
      input({
        priceEur: 100_000,
        landAreaM2: 50_000,
        location: { distanceFromVenloKm: 50 },
        isDetached: "yes",
        electricityStatus: "present",
        waterStatus: "present",
        renovationStatus: "needs_renovation",
        isSpecialObject: true,
      }),
      cfg,
    );
    expect(r.score).toBe(100);
  });

  it("the 8 max-point allocations match the brief verbatim", () => {
    expect(cfg.matchPoints).toEqual({
      price: 20,
      distance: 15,
      land: 20,
      detached: 15,
      electricity: 10,
      water: 5,
      renovation: 10,
      specialBonus: 5,
    });
    const sum = Object.values(cfg.matchPoints).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it("price ≤ €200k gives full 20 pt; €300k gives 0; €250k gives ~10", () => {
    const ok = scoreMatch(input({ priceEur: 199_000 }), cfg);
    expect(comp(ok, "match.price")).toBe(20);
    const mid = scoreMatch(input({ priceEur: 250_000 }), cfg);
    expect(comp(mid, "match.price")).toBeGreaterThanOrEqual(9);
    expect(comp(mid, "match.price")).toBeLessThanOrEqual(11);
    const over = scoreMatch(input({ priceEur: 300_000 }), cfg);
    expect(comp(over, "match.price")).toBe(0);
  });

  it("distance ≤ 350 km gives full 15 pt; 500 km gives 0", () => {
    const ok = scoreMatch(input({ location: { distanceFromVenloKm: 250 } }), cfg);
    expect(comp(ok, "match.distance")).toBe(15);
    const over = scoreMatch(input({ location: { distanceFromVenloKm: 500 } }), cfg);
    expect(comp(over, "match.distance")).toBe(0);
  });

  it("land ≥ 10.000 m² gives full 20 pt; 5.000 m² gives 0; 7.500 m² gives ~10", () => {
    const ok = scoreMatch(input({ landAreaM2: 15_000 }), cfg);
    expect(comp(ok, "match.land")).toBe(20);
    const half = scoreMatch(input({ landAreaM2: 7_500 }), cfg);
    expect(comp(half, "match.land")).toBeGreaterThanOrEqual(9);
    expect(comp(half, "match.land")).toBeLessThanOrEqual(11);
    const floor = scoreMatch(input({ landAreaM2: 5_000 }), cfg);
    expect(comp(floor, "match.land")).toBe(0);
  });

  it("detached: yes=15, no=0, unknown=6 (40%)", () => {
    expect(comp(scoreMatch(input({ isDetached: "yes" }), cfg), "match.detached")).toBe(15);
    expect(comp(scoreMatch(input({ isDetached: "no" }), cfg), "match.detached")).toBe(0);
    expect(comp(scoreMatch(input({ isDetached: "unknown" }), cfg), "match.detached")).toBe(6);
  });

  it("electricity: present=10, likely=7, unknown=3, absent=0", () => {
    expect(
      comp(scoreMatch(input({ electricityStatus: "present" }), cfg), "match.electricity"),
    ).toBe(10);
    expect(
      comp(scoreMatch(input({ electricityStatus: "likely" }), cfg), "match.electricity"),
    ).toBe(7);
    expect(
      comp(scoreMatch(input({ electricityStatus: "unknown" }), cfg), "match.electricity"),
    ).toBe(3);
    expect(
      comp(scoreMatch(input({ electricityStatus: "absent" }), cfg), "match.electricity"),
    ).toBe(0);
  });

  it("water: same scaling but max 5", () => {
    expect(comp(scoreMatch(input({ waterStatus: "present" }), cfg), "match.water")).toBe(5);
    expect(comp(scoreMatch(input({ waterStatus: "likely" }), cfg), "match.water")).toBe(4);
    expect(comp(scoreMatch(input({ waterStatus: "absent" }), cfg), "match.water")).toBe(0);
  });

  it("renovation indication: ruin/needs=10, partial=5, ready=0, unknown=3", () => {
    expect(comp(scoreMatch(input({ renovationStatus: "ruin" }), cfg), "match.renovation")).toBe(10);
    expect(comp(scoreMatch(input({ renovationStatus: "needs_renovation" }), cfg), "match.renovation")).toBe(10);
    expect(comp(scoreMatch(input({ renovationStatus: "partial_renovation" }), cfg), "match.renovation")).toBe(5);
    expect(comp(scoreMatch(input({ renovationStatus: "move_in_ready" }), cfg), "match.renovation")).toBe(0);
    expect(comp(scoreMatch(input({ renovationStatus: "unknown" }), cfg), "match.renovation")).toBe(3);
  });

  it("special bonus: 5 when isSpecialObject=true, 0 otherwise", () => {
    expect(comp(scoreMatch(input({ isSpecialObject: false }), cfg), "match.special_bonus")).toBe(0);
    expect(comp(scoreMatch(input({ isSpecialObject: true }), cfg), "match.special_bonus")).toBe(5);
  });

  it("returns 8 component lines on every call (full explainability)", () => {
    const r = scoreMatch(input(), cfg);
    expect(r.components).toHaveLength(8);
    expect(r.components.map((c) => c.id)).toEqual([
      "match.price",
      "match.distance",
      "match.land",
      "match.detached",
      "match.electricity",
      "match.water",
      "match.renovation",
      "match.special_bonus",
    ]);
    for (const c of r.components) {
      expect(c.evidence.length).toBeGreaterThan(0);
      expect(c.points).toBeGreaterThanOrEqual(0);
      expect(c.points).toBeLessThanOrEqual(c.max);
    }
  });

  it("clamped: terrible listing still ≥ 0", () => {
    const r = scoreMatch(
      input({
        priceEur: 1_000_000,
        landAreaM2: 0,
        location: { distanceFromVenloKm: 10_000 },
        isDetached: "no",
        electricityStatus: "absent",
        waterStatus: "absent",
        renovationStatus: "move_in_ready",
        isSpecialObject: false,
      }),
      cfg,
    );
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });
});

function comp(result: { components: { id: string; points: number }[] }, id: string): number {
  const c = result.components.find((c) => c.id === id);
  if (!c) throw new Error(`component ${id} not found`);
  return c.points;
}
