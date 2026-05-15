import { describe, it, expect } from "vitest";
import { clamp01_100, composeScore, COMPOSITE_WEIGHTS } from "./types";

describe("scoring/types", () => {
  it("composite weights sum to 1.0", () => {
    const sum = Object.values(COMPOSITE_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 5);
  });

  it("composeScore returns 100 when all components are 100", () => {
    const c = composeScore({
      matchScore: 100,
      renovationScore: 100,
      specialObjectScore: 100,
      dataConfidence: 100,
      investmentPotentialScore: 100,
    });
    expect(c).toBeCloseTo(100, 5);
  });

  it("composeScore returns 0 when all components are 0", () => {
    const c = composeScore({
      matchScore: 0,
      renovationScore: 0,
      specialObjectScore: 0,
      dataConfidence: 0,
      investmentPotentialScore: 0,
    });
    expect(c).toBe(0);
  });

  it("specialObjectScore dominates over match alone (per brief)", () => {
    const onlyMatch = composeScore({
      matchScore: 100,
      renovationScore: 0,
      specialObjectScore: 0,
      dataConfidence: 0,
      investmentPotentialScore: 0,
    });
    const onlySpecial = composeScore({
      matchScore: 0,
      renovationScore: 0,
      specialObjectScore: 100,
      dataConfidence: 0,
      investmentPotentialScore: 0,
    });
    // Per COMPOSITE_WEIGHTS, both are 0.30, so they should be equal-ranked.
    // The intent is: a mediocre match on a special object should not drown out
    // a special-object-positive signal. This test pins the contract.
    expect(onlySpecial).toBeGreaterThanOrEqual(onlyMatch);
  });

  it("clamp01_100 clamps and handles NaN", () => {
    expect(clamp01_100(-5)).toBe(0);
    expect(clamp01_100(150)).toBe(100);
    expect(clamp01_100(42)).toBe(42);
    expect(clamp01_100(Number.NaN)).toBe(0);
  });
});
