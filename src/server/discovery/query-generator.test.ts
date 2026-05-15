import { describe, it, expect } from "vitest";
import { generateQueries } from "./query-generator";

describe("generateQueries", () => {
  it("returns FR queries when language=fr", () => {
    const q = generateQueries({ country: "FR", language: "fr", region: "Lorraine" });
    expect(q.some((s) => s.includes("agence immobilière Lorraine"))).toBe(true);
    expect(q.some((s) => s.includes("immobilier rural Lorraine"))).toBe(true);
    expect(q.some((s) => s.includes("annuaire"))).toBe(true);
  });

  it("returns DE queries when language=de", () => {
    const q = generateQueries({ country: "DE", language: "de", region: "Eifel" });
    expect(q.some((s) => s.includes("Immobilienmakler Eifel"))).toBe(true);
    expect(q.some((s) => s.includes("Resthof Makler Eifel"))).toBe(true);
  });

  it("returns NL queries when language=nl", () => {
    const q = generateQueries({ country: "BE", language: "nl", region: "Wallonie" });
    expect(q.some((s) => s.includes("makelaar Wallonie"))).toBe(true);
    expect(q.some((s) => s.includes("vastgoedkantoor Wallonie"))).toBe(true);
  });

  it("falls back to default regions when none given", () => {
    const q = generateQueries({ country: "FR", language: "fr" });
    // Should pick up Lorraine + Champagne-Ardenne + others.
    expect(q.some((s) => s.includes("Lorraine"))).toBe(true);
    expect(q.some((s) => s.includes("Ardennes"))).toBe(true);
    expect(q.length).toBeGreaterThan(10);
  });

  it("is deterministic — same input produces same order", () => {
    const a = generateQueries({ country: "FR", language: "fr", region: "Lorraine" });
    const b = generateQueries({ country: "FR", language: "fr", region: "Lorraine" });
    expect(a).toEqual(b);
  });

  it("dedups within a run", () => {
    const q = generateQueries({ country: "FR", language: "fr", region: "Lorraine" });
    expect(new Set(q).size).toBe(q.length);
  });
});
