import { describe, it, expect } from "vitest";
import { lookupRegionCentroid } from "./region-centroids";

describe("lookupRegionCentroid", () => {
  it("returns null when region is missing", () => {
    expect(lookupRegionCentroid("FR", null)).toBeNull();
    expect(lookupRegionCentroid("FR", "")).toBeNull();
  });

  it("returns null when region is unknown", () => {
    expect(lookupRegionCentroid("FR", "Atlantis")).toBeNull();
  });

  it("matches exact key", () => {
    const r = lookupRegionCentroid("FR", "Lorraine");
    expect(r?.label).toContain("Lorraine");
  });

  it("matches case-insensitively + accent-insensitively", () => {
    const a = lookupRegionCentroid("BE", "Liège");
    const b = lookupRegionCentroid("BE", "LIEGE");
    expect(a?.lat).toBe(b?.lat);
  });

  it("matches via substring (longer query containing key)", () => {
    const r = lookupRegionCentroid("FR", "Région Grand Est");
    expect(r?.label).toContain("Grand Est");
  });

  it("DE Eifel returns coordinates inside 350 km of Venlo", () => {
    const r = lookupRegionCentroid("DE", "Eifel");
    expect(r).not.toBeNull();
    // Eifel centroid (50.35, 6.6) is within ~120 km of Venlo (51.37, 6.17).
    expect(Math.abs(r!.lat - 50.35)).toBeLessThan(0.1);
  });

  it("looks up in the correct country table", () => {
    // "Limburg" exists in NL only.
    const nl = lookupRegionCentroid("NL", "Limburg");
    expect(nl).not.toBeNull();
    // "Eifel" doesn't exist in FR.
    expect(lookupRegionCentroid("FR", "Eifel")).toBeNull();
  });
});
