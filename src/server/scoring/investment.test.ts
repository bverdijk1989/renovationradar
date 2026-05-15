import { describe, it, expect } from "vitest";
import { scoreInvestment } from "./investment";
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
    titleOriginal: "x",
    ...over,
  };
}

const cfg = DEFAULT_SCORING_CONFIG;

describe("investment potential score — combines 6 factors", () => {
  it("low €/m² → high price-per-m² component", () => {
    // 100k € over 25k m² = 4 €/m² (very attractive).
    const r = scoreInvestment(input({ priceEur: 100_000, landAreaM2: 25_000 }), cfg, 80);
    const c = r.components.find((c) => c.id === "investment.price_per_m2")!;
    expect(c.points).toBeGreaterThanOrEqual(20);
  });

  it("high €/m² → near-zero price-per-m² component", () => {
    // 200k € over 5k m² = 40 €/m² (off the chart, gets 0).
    const r = scoreInvestment(input({ priceEur: 200_000, landAreaM2: 5_000 }), cfg, 80);
    const c = r.components.find((c) => c.id === "investment.price_per_m2")!;
    expect(c.points).toBe(0);
  });

  it("more land = more investment points (10 → 20 range)", () => {
    const small = scoreInvestment(input({ landAreaM2: 10_000 }), cfg, 80);
    const big = scoreInvestment(input({ landAreaM2: 30_000 }), cfg, 80);
    const smallPts = small.components.find((c) => c.id === "investment.land_amount")!.points;
    const bigPts = big.components.find((c) => c.id === "investment.land_amount")!.points;
    expect(bigPts).toBeGreaterThan(smallPts);
    expect(bigPts).toBe(20);
  });

  it("special object adds 15 points", () => {
    const without = scoreInvestment(input({ isSpecialObject: false }), cfg, 80);
    const withSpecial = scoreInvestment(input({ isSpecialObject: true }), cfg, 80);
    const a = without.components.find((c) => c.id === "investment.special_object")!.points;
    const b = withSpecial.components.find((c) => c.id === "investment.special_object")!.points;
    expect(b - a).toBe(15);
  });

  it("closer to Venlo → more distance points (50 km = 15, 250 km < 15)", () => {
    const close = scoreInvestment(input({ location: { distanceFromVenloKm: 50 } }), cfg, 80);
    const mid = scoreInvestment(input({ location: { distanceFromVenloKm: 250 } }), cfg, 80);
    const far = scoreInvestment(input({ location: { distanceFromVenloKm: 500 } }), cfg, 80);
    const cP = close.components.find((c) => c.id === "investment.distance")!.points;
    const mP = mid.components.find((c) => c.id === "investment.distance")!.points;
    const fP = far.components.find((c) => c.id === "investment.distance")!.points;
    expect(cP).toBe(15);
    expect(mP).toBeLessThan(15);
    expect(fP).toBeLessThan(mP);
  });

  it("more renovation upside (ruin) > less upside (move_in_ready)", () => {
    const ruin = scoreInvestment(input({ renovationStatus: "ruin" }), cfg, 80);
    const ready = scoreInvestment(input({ renovationStatus: "move_in_ready" }), cfg, 80);
    const a = ruin.components.find((c) => c.id === "investment.renovation")!.points;
    const b = ready.components.find((c) => c.id === "investment.renovation")!.points;
    expect(a).toBeGreaterThan(b);
  });

  it("higher dataConfidence boosts the investment score (less risk premium)", () => {
    const lowConf = scoreInvestment(input(), cfg, 20);
    const highConf = scoreInvestment(input(), cfg, 100);
    expect(highConf.score).toBeGreaterThan(lowConf.score);
  });

  it("returns 6 component lines", () => {
    const r = scoreInvestment(input(), cfg, 80);
    expect(r.components.map((c) => c.id)).toEqual([
      "investment.price_per_m2",
      "investment.land_amount",
      "investment.special_object",
      "investment.distance",
      "investment.renovation",
      "investment.data_confidence",
    ]);
  });

  it("output clamped to 0..100", () => {
    const r = scoreInvestment(
      input({
        priceEur: 50_000,
        landAreaM2: 100_000,
        isSpecialObject: true,
        location: { distanceFromVenloKm: 10 },
        renovationStatus: "ruin",
      }),
      cfg,
      100,
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
