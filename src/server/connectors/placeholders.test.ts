import { describe, it, expect } from "vitest";
import type { Source } from "@prisma/client";
import { ApiConnector } from "./api";
import { PermittedHtmlConnector } from "./html";
import { EmailNewsletterConnector } from "./email";
import { MockTransport } from "./transport";
import { NoopRateLimiter } from "./rate-limit";
import { NotImplementedError } from "./errors";

function source(over: Partial<Source> = {}): Source {
  return {
    id: "s1",
    name: "X",
    country: "FR",
    website: "https://example.com",
    sourceType: "api",
    collectionMethods: ["api"],
    status: "active",
    robotsStatus: "allows",
    termsStatus: "allows",
    legalStatus: "green",
    lastCheckedAt: null,
    notes: null,
    connectorConfig: null,
    rateLimitPerMinute: null,
    userAgent: null,
    classification: "unknown",
    discoveryMeta: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Source;
}

const ctx = {
  transport: new MockTransport({}),
  rateLimiter: new NoopRateLimiter(),
  crawlJobId: "j1",
};

describe("ApiConnector (placeholder)", () => {
  const c = new ApiConnector();

  it("canHandle accepts API-type sources", () => {
    expect(c.canHandle(source({ sourceType: "api" }))).toBe(true);
    expect(
      c.canHandle(source({ sourceType: "rss", collectionMethods: ["api"] })),
    ).toBe(true);
  });

  it("validateSource fails with an issue mentioning 'placeholder'", async () => {
    const r = await c.validateSource(source());
    expect(r.ok).toBe(false);
    expect(r.issues.join(" ")).toMatch(/placeholder/i);
  });

  it("fetchListings throws NotImplementedError", async () => {
    await expect(c.fetchListings(source(), null, ctx)).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });
});

describe("PermittedHtmlConnector (placeholder)", () => {
  const c = new PermittedHtmlConnector();

  it("canHandle accepts scrape-type sources OR scrape_with_permission methods", () => {
    expect(c.canHandle(source({ sourceType: "scrape" }))).toBe(true);
    expect(
      c.canHandle(
        source({
          sourceType: "rss",
          collectionMethods: ["scrape_with_permission"],
        }),
      ),
    ).toBe(true);
    expect(c.canHandle(source({ sourceType: "rss", collectionMethods: ["rss"] }))).toBe(
      false,
    );
  });

  it("validateSource rejects when scrape_with_permission is missing", async () => {
    const r = await c.validateSource(
      source({ sourceType: "scrape", collectionMethods: ["api"] }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("scrape_with_permission"))).toBe(
      true,
    );
  });

  it("fetchListings throws NotImplementedError", async () => {
    await expect(c.fetchListings(source(), null, ctx)).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });
});

describe("EmailNewsletterConnector (placeholder)", () => {
  const c = new EmailNewsletterConnector();

  it("canHandle accepts email-type sources OR email_inbox methods", () => {
    expect(c.canHandle(source({ sourceType: "email" }))).toBe(true);
    expect(
      c.canHandle(
        source({ sourceType: "rss", collectionMethods: ["email_inbox"] }),
      ),
    ).toBe(true);
  });

  it("validateSource fails with placeholder note", async () => {
    const r = await c.validateSource(source());
    expect(r.ok).toBe(false);
    expect(r.issues[0]).toMatch(/placeholder|webhook/i);
  });

  it("fetchListings throws NotImplementedError", async () => {
    await expect(c.fetchListings(source(), null, ctx)).rejects.toBeInstanceOf(
      NotImplementedError,
    );
  });
});
