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

describe("PermittedHtmlConnector (generic scraper)", () => {
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
      source({
        sourceType: "scrape",
        collectionMethods: ["api"],
        legalStatus: "green",
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("scrape_with_permission"))).toBe(
      true,
    );
  });

  it("validateSource rejects when legalStatus is not green", async () => {
    const r = await c.validateSource(
      source({
        sourceType: "scrape",
        collectionMethods: ["scrape_with_permission"],
        legalStatus: "pending_review",
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.includes("green"))).toBe(true);
  });

  it("extracts individual property links via id-marker / deep-path / long-slug heuristics", async () => {
    const indexHtml = `
      <html><head><title>Welkom bij makelaar</title></head>
      <body>
        <a href="/over-ons">Over ons</a>
        <a href="/te-koop">Volledig aanbod (te kort)</a>
        <a href="/te-koop/huis-1">Categoriepagina (te kort)</a>
        <a href="/te-koop/ref-12345-boerderij-lorraine">Met ref-marker</a>
        <a href="/te-koop/grand-domaine-rural-pres-de-rouen-paris">Lange slug (5 hyphens)</a>
        <a href="/te-koop/huis/tournai-7500">City-index (gaat naar depth-2)</a>
        <a href="/agence/makelaar-12345">Op deny-list</a>
        <a href="https://external.com/x">externe link</a>
      </body></html>`;
    const cityIndexHtml = `
      <html><body>
        <a href="/te-koop/ref-99876-prachtige-villa">Prachtige villa</a>
        <a href="/agence/iets">deny-list ook hier</a>
      </body></html>`;
    const transport = new MockTransport({
      "https://example.com/": { body: indexHtml },
      "https://example.com/te-koop/huis/tournai-7500": { body: cityIndexHtml },
      "https://example.com/te-koop/ref-12345-boerderij-lorraine": {
        body: `<html><head><title>Boerderij</title></head></html>`,
      },
      "https://example.com/te-koop/grand-domaine-rural-pres-de-rouen-paris": {
        body: `<html><head><title>Grand Domaine</title></head></html>`,
      },
      "https://example.com/te-koop/ref-99876-prachtige-villa": {
        body: `<html><head><title>Villa</title></head></html>`,
      },
    });
    const drafts = await c.fetchListings(
      source({
        sourceType: "scrape",
        collectionMethods: ["scrape_with_permission"],
        legalStatus: "green",
        website: "https://example.com/",
      }),
      null,
      { transport, rateLimiter: new NoopRateLimiter(), crawlJobId: "j1" },
    );
    // Verwacht: 3 details — 2 direct van de homepage, 1 via depth-2 vanuit
    // de city-index. Geen city-index zelf, geen deny-list paden.
    expect(drafts.map((d) => d.url).sort()).toEqual([
      "https://example.com/te-koop/grand-domaine-rural-pres-de-rouen-paris",
      "https://example.com/te-koop/ref-12345-boerderij-lorraine",
      "https://example.com/te-koop/ref-99876-prachtige-villa",
    ]);
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
