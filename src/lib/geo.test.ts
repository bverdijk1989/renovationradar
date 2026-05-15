import { describe, it, expect } from "vitest";
import {
  VENLO,
  bboxAround,
  haversineMeters,
  kmFromVenlo,
  withinRadius,
} from "./geo";

describe("geo", () => {
  it("Venlo constant matches the project origin", () => {
    expect(VENLO.lat).toBeCloseTo(51.3704, 4);
    expect(VENLO.lng).toBeCloseTo(6.1724, 4);
  });

  it("haversine distance is symmetric", () => {
    const a = { lat: 50.8503, lng: 4.3517 }; // Brussels
    const b = { lat: 52.5200, lng: 13.4050 }; // Berlin
    const ab = haversineMeters(a, b);
    const ba = haversineMeters(b, a);
    expect(ab).toBeCloseTo(ba, 0);
  });

  it("haversine distance Brussels-Venlo is roughly 130 km", () => {
    const brussels = { lat: 50.8503, lng: 4.3517 };
    const km = haversineMeters(brussels, VENLO) / 1000;
    expect(km).toBeGreaterThan(125);
    expect(km).toBeLessThan(140);
  });

  it("kmFromVenlo returns 0 for Venlo itself", () => {
    expect(kmFromVenlo(VENLO)).toBeLessThan(0.001);
  });

  it("kmFromVenlo Paris ~ 460 km (outside default radius)", () => {
    const paris = { lat: 48.8566, lng: 2.3522 };
    const km = kmFromVenlo(paris);
    expect(km).toBeGreaterThan(440);
    expect(km).toBeLessThan(480);
  });

  it("bboxAround spans roughly 2*radius / 111 km in lat", () => {
    const bbox = bboxAround(VENLO, 350);
    const latDelta = bbox.maxLat - bbox.minLat;
    expect(latDelta).toBeCloseTo((350 * 2) / 111, 1);
    expect(bbox.minLat).toBeLessThan(VENLO.lat);
    expect(bbox.maxLng).toBeGreaterThan(VENLO.lng);
  });

  it("withinRadius is strict at the boundary", () => {
    // A point ~349 km away should be inside; ~351 km should not.
    // Move purely north for simplicity.
    const near = { lat: VENLO.lat + 349 / 111, lng: VENLO.lng };
    const far = { lat: VENLO.lat + 351 / 111, lng: VENLO.lng };
    expect(withinRadius(VENLO, near, 350)).toBe(true);
    expect(withinRadius(VENLO, far, 350)).toBe(false);
  });
});
