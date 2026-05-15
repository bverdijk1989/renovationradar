import { describe, it, expect, vi } from "vitest";
import { NominatimProvider } from "./providers/nominatim";
import { MockTransport } from "@/server/connectors";

function fixtureBody(entries: Array<Record<string, unknown>>): string {
  return JSON.stringify(entries);
}

describe("NominatimProvider", () => {
  const userAgent = "TestRunner/1.0 (test@example.com)";

  it("returns null on empty result array", async () => {
    const transport = new MockTransport({});
    const handler = vi.fn(() => ({ body: fixtureBody([]) }));
    const p = new NominatimProvider({ get: handler } as never, { userAgent });
    const r = await p.geocode({ country: "FR", city: "Nowhere" });
    expect(r).toBeNull();
  });

  it("maps a rooftop hit to confidence=high", async () => {
    const body = fixtureBody([
      {
        lat: "48.8566",
        lon: "2.3522",
        importance: 0.9,
        type: "house",
        addresstype: "house",
        display_name: "1 Rue X, Paris",
      },
    ]);
    const transport = { get: async () => ({ status: 200, headers: {}, body, url: "x" }) } as never;
    const p = new NominatimProvider(transport, { userAgent });
    const r = await p.geocode({
      country: "FR",
      addressLine: "1 Rue X",
      city: "Paris",
      postalCode: "75001",
    });
    expect(r).not.toBeNull();
    expect(r!.lat).toBeCloseTo(48.8566, 4);
    expect(r!.lng).toBeCloseTo(2.3522, 4);
    expect(r!.confidence).toBe("high");
    expect(r!.accuracy).toBe("rooftop");
  });

  it("city-only query caps confidence at medium even when provider says high", async () => {
    const body = fixtureBody([
      {
        lat: "48.85",
        lon: "2.35",
        importance: 0.9,
        type: "city",
        addresstype: "city",
        display_name: "Paris",
      },
    ]);
    const p = new NominatimProvider(
      { get: async () => ({ status: 200, headers: {}, body, url: "x" }) } as never,
      { userAgent },
    );
    const r = await p.geocode({ country: "FR", city: "Paris" });
    // Provider type=city → medium; query upper-bound=medium; min(medium, medium) = medium.
    expect(r!.confidence).toBe("medium");
  });

  it("picks the highest-importance entry when multiple are returned", async () => {
    const body = fixtureBody([
      { lat: "10", lon: "10", importance: 0.3, type: "city", display_name: "low" },
      { lat: "20", lon: "20", importance: 0.9, type: "city", display_name: "high" },
      { lat: "30", lon: "30", importance: 0.6, type: "city", display_name: "mid" },
    ]);
    const p = new NominatimProvider(
      { get: async () => ({ status: 200, headers: {}, body, url: "x" }) } as never,
      { userAgent },
    );
    const r = await p.geocode({ country: "FR", city: "X" });
    expect(r!.lat).toBe(20);
    expect(r!.lng).toBe(20);
  });

  it("throws ProviderFetchError on non-JSON body", async () => {
    const p = new NominatimProvider(
      {
        get: async () => ({ status: 200, headers: {}, body: "<html>nope</html>", url: "x" }),
      } as never,
      { userAgent },
    );
    await expect(p.geocode({ country: "FR", city: "X" })).rejects.toThrow(/non-JSON/);
  });

  it("throws ProviderFetchError on transport failure", async () => {
    const p = new NominatimProvider(
      {
        get: async () => {
          throw new Error("HTTP 503");
        },
      } as never,
      { userAgent },
    );
    await expect(p.geocode({ country: "FR", city: "X" })).rejects.toThrow(/fetch failed/);
  });
});
