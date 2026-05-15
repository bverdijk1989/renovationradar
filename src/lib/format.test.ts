import { describe, it, expect } from "vitest";
import {
  formatDistance,
  formatLandArea,
  formatPrice,
  label,
  PROPERTY_TYPE_LABELS,
  RENOVATION_STATUS_LABELS,
} from "./format";

describe("format", () => {
  it("formatPrice produces NL Euro string with no decimals", () => {
    expect(formatPrice(150_000)).toMatch(/€/);
    expect(formatPrice(150_000)).toContain("150");
    expect(formatPrice(150_000)).not.toContain(",00");
  });

  it("formatPrice returns em-dash for null", () => {
    expect(formatPrice(null)).toBe("—");
    expect(formatPrice(undefined)).toBe("—");
  });

  it("formatLandArea switches to hectares at ≥10.000 m²", () => {
    expect(formatLandArea(9_999)).toContain("m²");
    expect(formatLandArea(10_000)).toContain("ha");
    expect(formatLandArea(15_000)).toContain("1,5");
    expect(formatLandArea(15_000)).toContain("ha");
  });

  it("formatDistance shows one decimal under 10 km, integer otherwise", () => {
    expect(formatDistance(3.5)).toContain("3,5");
    expect(formatDistance(125)).toContain("125");
    expect(formatDistance(125)).not.toContain(",");
  });

  it("label falls back to the raw key when not in map", () => {
    expect(label(PROPERTY_TYPE_LABELS, "watermill")).toBe("Watermolen");
    expect(label(PROPERTY_TYPE_LABELS, "unknown_key")).toBe("unknown_key");
    expect(label(PROPERTY_TYPE_LABELS, null)).toBe("—");
  });

  it("renovation status labels cover the brief's enum", () => {
    expect(label(RENOVATION_STATUS_LABELS, "ruin")).toBe("Ruïne");
    expect(label(RENOVATION_STATUS_LABELS, "needs_renovation")).toBe("Te renoveren");
    expect(label(RENOVATION_STATUS_LABELS, "move_in_ready")).toBe("Instapklaar");
  });
});
