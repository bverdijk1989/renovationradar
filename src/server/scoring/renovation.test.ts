import { describe, it, expect } from "vitest";
import { scoreRenovation } from "./renovation";
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

describe("renovation score", () => {
  it("enum base: ruin > needs > partial > ready", () => {
    const ruin = scoreRenovation(input({ renovationStatus: "ruin" }), cfg).score;
    const needs = scoreRenovation(input({ renovationStatus: "needs_renovation" }), cfg).score;
    const partial = scoreRenovation(input({ renovationStatus: "partial_renovation" }), cfg).score;
    const ready = scoreRenovation(input({ renovationStatus: "move_in_ready" }), cfg).score;
    expect(ruin).toBeGreaterThan(needs);
    expect(needs).toBeGreaterThan(partial);
    expect(partial).toBeGreaterThan(ready);
  });

  it("FR keyword 'à rénover' adds +5 bonus", () => {
    const without = scoreRenovation(
      input({ titleOriginal: "Belle ferme avec terrain", language: "fr" }),
      cfg,
    );
    const withKw = scoreRenovation(
      input({ titleOriginal: "Belle ferme à rénover avec terrain", language: "fr" }),
      cfg,
    );
    expect(withKw.score).toBe(without.score + 5);
  });

  it("NL keyword 'opknapwoning' / 'casco' both fire", () => {
    const r = scoreRenovation(
      input({
        titleOriginal: "Opknapwoning, casco",
        language: "nl",
        renovationStatus: "needs_renovation",
      }),
      cfg,
    );
    const bonus = r.components.find((c) => c.id === "renovation.keyword_bonus")!;
    expect(bonus.points).toBe(10); // 2 fresh hits × 5
    expect(bonus.evidence).toMatch(/opknapwoning/);
    expect(bonus.evidence).toMatch(/casco/);
  });

  it("DE keywords 'sanierungsbedürftig' and 'modernisierungsbedürftig'", () => {
    const r = scoreRenovation(
      input({
        titleOriginal: "Bauernhaus sanierungsbedürftig",
        descriptionOriginal: "Modernisierungsbedürftig, Strom vorhanden.",
        language: "de",
      }),
      cfg,
    );
    const bonus = r.components.find((c) => c.id === "renovation.keyword_bonus")!;
    expect(bonus.points).toBe(10);
  });

  it("bonus is capped at 15 even with many hits", () => {
    const r = scoreRenovation(
      input({
        titleOriginal: "à rénover travaux à prévoir gros potentiel rénovation complète à restaurer",
        descriptionOriginal: "gros oeuvre",
        language: "fr",
      }),
      cfg,
    );
    const bonus = r.components.find((c) => c.id === "renovation.keyword_bonus")!;
    expect(bonus.points).toBe(15);
  });

  it("zero hits → bonus 0", () => {
    const r = scoreRenovation(
      input({ titleOriginal: "Villa avec piscine", language: "fr" }),
      cfg,
    );
    const bonus = r.components.find((c) => c.id === "renovation.keyword_bonus")!;
    expect(bonus.points).toBe(0);
  });

  it("output is clamped 0..100", () => {
    const r = scoreRenovation(
      input({
        renovationStatus: "ruin",
        titleOriginal: "à rénover travaux gros potentiel rénovation complète à restaurer",
        language: "fr",
      }),
      cfg,
    );
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.score).toBeGreaterThanOrEqual(0);
  });
});
