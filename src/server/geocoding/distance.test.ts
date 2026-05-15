import { describe, it, expect } from "vitest";
import {
  straightLineDistanceKmFromVenlo,
  NullDrivingProvider,
  OsrmDrivingProvider,
  MockDrivingProvider,
} from "./distance";
import { GeocoderNotImplementedError } from "./errors";
import { VENLO } from "@/lib/geo";

describe("distance helpers", () => {
  it("straight-line distance from Venlo to Venlo is ~0", () => {
    expect(straightLineDistanceKmFromVenlo(VENLO)).toBeLessThan(0.001);
  });

  it("Brussels to Venlo ~ 130 km", () => {
    const brussels = { lat: 50.8503, lng: 4.3517 };
    const km = straightLineDistanceKmFromVenlo(brussels);
    expect(km).toBeGreaterThan(125);
    expect(km).toBeLessThan(140);
  });

  it("NullDrivingProvider returns null", async () => {
    const p = new NullDrivingProvider();
    expect(
      await p.drivingKm({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }),
    ).toBeNull();
  });

  it("OsrmDrivingProvider stub throws NotImplementedError", async () => {
    const p = new OsrmDrivingProvider();
    await expect(
      p.drivingKm({ lat: 0, lng: 0 }, { lat: 1, lng: 1 }),
    ).rejects.toBeInstanceOf(GeocoderNotImplementedError);
  });

  it("MockDrivingProvider returns the lookup function's value", async () => {
    const p = new MockDrivingProvider(() => 42);
    expect(await p.drivingKm({ lat: 0, lng: 0 }, { lat: 1, lng: 1 })).toBe(42);
  });
});
