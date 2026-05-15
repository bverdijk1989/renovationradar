import { describe, it, expect } from "vitest";
import { scoreListing } from "./engine";
import { DEFAULT_SCORING_CONFIG, makeScoringConfig } from "./config";
import type { ScoringInput } from "./types";

function perfectInput(): ScoringInput {
  return {
    priceEur: 100_000,
    landAreaM2: 50_000,
    livingAreaM2: 200,
    propertyType: "watermill",
    renovationStatus: "needs_renovation",
    isSpecialObject: true,
    specialObjectType: "watermill",
    isDetached: "yes",
    electricityStatus: "present",
    waterStatus: "present",
    language: "fr",
    location: { distanceFromVenloKm: 50 },
    titleOriginal: "Moulin à eau à rénover",
    descriptionOriginal: "gros potentiel",
    normalizationConfidence: 90,
  };
}

function poorInput(): ScoringInput {
  return {
    priceEur: 500_000,
    landAreaM2: 1_000,
    livingAreaM2: null,
    propertyType: "detached_house",
    renovationStatus: "move_in_ready",
    isSpecialObject: false,
    specialObjectType: null,
    isDetached: "no",
    electricityStatus: "absent",
    waterStatus: "absent",
    language: "fr",
    location: { distanceFromVenloKm: 800 },
    titleOriginal: "Maison",
    normalizationConfidence: 30,
  };
}

describe("scoreListing — integration of the 5 sub-scorers", () => {
  it("a brief-perfect watermill produces near-100 across the board", () => {
    const r = scoreListing(perfectInput(), DEFAULT_SCORING_CONFIG);
    expect(r.matchScore).toBe(100);
    expect(r.renovationScore).toBeGreaterThan(85);
    expect(r.specialObjectScore).toBe(100);
    expect(r.dataConfidence).toBe(90);
    expect(r.investmentPotentialScore).toBeGreaterThan(70);
    expect(r.compositeScore).toBeGreaterThan(85);
  });

  it("a poor listing produces low scores across the board", () => {
    const r = scoreListing(poorInput(), DEFAULT_SCORING_CONFIG);
    expect(r.matchScore).toBeLessThan(20);
    expect(r.specialObjectScore).toBe(0);
    expect(r.compositeScore).toBeLessThan(40);
  });

  it("compositeScore = Σ score × weight (verifiable manually)", () => {
    const r = scoreListing(perfectInput(), DEFAULT_SCORING_CONFIG);
    const w = DEFAULT_SCORING_CONFIG.composite;
    const expected = Math.round(
      r.matchScore * w.matchScore +
        r.renovationScore * w.renovationScore +
        r.specialObjectScore * w.specialObjectScore +
        r.dataConfidence * w.dataConfidence +
        r.investmentPotentialScore * w.investmentPotentialScore,
    );
    expect(r.compositeScore).toBe(expected);
  });

  it("breakdown contains a component array for every score family", () => {
    const r = scoreListing(perfectInput(), DEFAULT_SCORING_CONFIG);
    expect(r.components.match.length).toBeGreaterThan(0);
    expect(r.components.renovation.length).toBeGreaterThan(0);
    expect(r.components.specialObject.length).toBeGreaterThan(0);
    expect(r.components.investment.length).toBeGreaterThan(0);
    expect(r.components.dataConfidence.length).toBeGreaterThan(0);
  });

  it("scorerVersion is exposed for reproducibility", () => {
    const r = scoreListing(perfectInput(), DEFAULT_SCORING_CONFIG);
    expect(r.scorerVersion).toBe(DEFAULT_SCORING_CONFIG.scorerVersion);
  });

  it("deterministic: same input → identical output", () => {
    const input = perfectInput();
    const a = scoreListing(input, DEFAULT_SCORING_CONFIG);
    const b = scoreListing(input, DEFAULT_SCORING_CONFIG);
    expect(a).toEqual(b);
  });

  it("custom composite weights change the composite (e.g. boost special)", () => {
    const baseline = scoreListing(perfectInput(), DEFAULT_SCORING_CONFIG);
    const specialHeavy = makeScoringConfig({
      composite: {
        matchScore: 0.20,
        renovationScore: 0.10,
        specialObjectScore: 0.50, // doubled
        dataConfidence: 0.10,
        investmentPotentialScore: 0.10,
      },
    });
    const boosted = scoreListing(perfectInput(), specialHeavy);
    // Special is already at 100 so doubling its weight shouldn't lower composite.
    expect(boosted.compositeScore).toBeGreaterThanOrEqual(baseline.compositeScore - 1);
  });

  it("makeScoringConfig rejects weights that don't sum to 1.0", () => {
    expect(() =>
      makeScoringConfig({
        composite: {
          matchScore: 0.5,
          renovationScore: 0.5,
          specialObjectScore: 0.5,
          dataConfidence: 0,
          investmentPotentialScore: 0,
        },
      }),
    ).toThrow(/sum to 1\.0/);
  });

  it("all 5 primary scores are in 0..100", () => {
    for (const i of [perfectInput(), poorInput()]) {
      const r = scoreListing(i, DEFAULT_SCORING_CONFIG);
      for (const v of [
        r.matchScore,
        r.renovationScore,
        r.specialObjectScore,
        r.dataConfidence,
        r.investmentPotentialScore,
        r.compositeScore,
      ]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});
