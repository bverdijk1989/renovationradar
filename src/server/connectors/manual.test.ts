import { describe, it, expect } from "vitest";
import type { Source } from "@prisma/client";
import { ManualConnector } from "./manual";
import { MockTransport } from "./transport";
import { NoopRateLimiter } from "./rate-limit";

function source(over: Partial<Source> = {}): Source {
  return {
    id: "s1",
    name: "Manual entry · FR",
    country: "FR",
    website: "internal://manual",
    sourceType: "manual",
    collectionMethods: ["manual_entry"],
    status: "active",
    robotsStatus: "not_applicable",
    termsStatus: "not_applicable",
    legalStatus: "green",
    lastCheckedAt: null,
    notes: null,
    connectorConfig: null,
    rateLimitPerMinute: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Source;
}

describe("ManualConnector", () => {
  const c = new ManualConnector();

  it("claims sources whose collection methods are EXCLUSIVELY manual_entry", () => {
    expect(c.canHandle(source({ collectionMethods: ["manual_entry"] }))).toBe(true);
    expect(
      c.canHandle(source({ collectionMethods: ["manual_entry", "rss"] })),
    ).toBe(false);
    expect(c.canHandle(source({ collectionMethods: ["rss"] }))).toBe(false);
    expect(c.canHandle(source({ collectionMethods: [] }))).toBe(false);
  });

  it("validates a green manual source as ok", async () => {
    const r = await c.validateSource(source());
    expect(r.ok).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it("warns when legalStatus != green", async () => {
    const r = await c.validateSource(source({ legalStatus: "pending_review" }));
    expect(r.ok).toBe(true);
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it("fetchListings is a no-op (returns [])", async () => {
    const drafts = await c.fetchListings(source(), null, {
      transport: new MockTransport({}),
      rateLimiter: new NoopRateLimiter(),
      crawlJobId: "j1",
    });
    expect(drafts).toEqual([]);
  });
});
