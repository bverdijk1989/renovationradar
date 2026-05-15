import { describe, it, expect } from "vitest";
import type { Source } from "@prisma/client";
import { SitemapConnector } from "./sitemap";
import { MockTransport } from "./transport";
import { NoopRateLimiter } from "./rate-limit";

function source(over: Partial<Source> = {}): Source {
  return {
    id: "s1",
    name: "Example sitemap",
    country: "DE",
    website: "https://example.de",
    sourceType: "sitemap",
    collectionMethods: ["sitemap"],
    status: "active",
    robotsStatus: "allows",
    termsStatus: "allows",
    legalStatus: "green",
    lastCheckedAt: null,
    notes: null,
    connectorConfig: { sitemapUrl: "https://example.de/sitemap.xml" } as never,
    rateLimitPerMinute: null,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Source;
}

const URLSET_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.de/property/1</loc><lastmod>2026-05-01</lastmod></url>
  <url><loc>https://example.de/property/2</loc><lastmod>2026-05-02</lastmod></url>
  <url><loc>https://example.de/about</loc><lastmod>2024-01-01</lastmod></url>
</urlset>`;

const INDEX_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.de/sitemap-1.xml</loc></sitemap>
  <sitemap><loc>https://example.de/sitemap-2.xml</loc></sitemap>
</sitemapindex>`;

const CHILD_1 = `<?xml version="1.0"?>
<urlset><url><loc>https://example.de/property/a</loc></url></urlset>`;
const CHILD_2 = `<?xml version="1.0"?>
<urlset><url><loc>https://example.de/property/b</loc></url></urlset>`;

describe("SitemapConnector", () => {
  const c = new SitemapConnector();

  it("validates that sitemapUrl is required", async () => {
    expect((await c.validateSource(source({ connectorConfig: null }))).ok).toBe(false);
    expect((await c.validateSource(source())).ok).toBe(true);
  });

  it("parses a plain urlset into drafts (1 per <url>)", async () => {
    const drafts = await c.fetchListings(source(), null, {
      transport: new MockTransport({
        "https://example.de/sitemap.xml": { body: URLSET_FIXTURE },
      }),
      rateLimiter: new NoopRateLimiter(),
      crawlJobId: "j1",
    });
    expect(drafts).toHaveLength(3);
    expect(drafts[0]!.url).toBe("https://example.de/property/1");
    expect(drafts[0]!.payload.lastmod).toBe("2026-05-01");
  });

  it("urlPattern filter keeps only matching loc URLs", async () => {
    const drafts = await c.fetchListings(
      source({
        connectorConfig: {
          sitemapUrl: "https://example.de/sitemap.xml",
          urlPattern: "/property/",
        } as never,
      }),
      null,
      {
        transport: new MockTransport({
          "https://example.de/sitemap.xml": { body: URLSET_FIXTURE },
        }),
        rateLimiter: new NoopRateLimiter(),
        crawlJobId: "j1",
      },
    );
    expect(drafts).toHaveLength(2);
    expect(drafts.every((d) => d.url.includes("/property/"))).toBe(true);
  });

  it("ignores sitemap indexes by default (no followIndex)", async () => {
    const drafts = await c.fetchListings(source(), null, {
      transport: new MockTransport({
        "https://example.de/sitemap.xml": { body: INDEX_FIXTURE },
      }),
      rateLimiter: new NoopRateLimiter(),
      crawlJobId: "j1",
    });
    expect(drafts).toEqual([]);
  });

  it("follows sitemap indexes when followIndex=true", async () => {
    const drafts = await c.fetchListings(
      source({
        connectorConfig: {
          sitemapUrl: "https://example.de/sitemap.xml",
          followIndex: true,
        } as never,
      }),
      null,
      {
        transport: new MockTransport({
          "https://example.de/sitemap.xml": { body: INDEX_FIXTURE },
          "https://example.de/sitemap-1.xml": { body: CHILD_1 },
          "https://example.de/sitemap-2.xml": { body: CHILD_2 },
        }),
        rateLimiter: new NoopRateLimiter(),
        crawlJobId: "j1",
      },
    );
    expect(drafts.map((d) => d.url).sort()).toEqual([
      "https://example.de/property/a",
      "https://example.de/property/b",
    ]);
  });
});
