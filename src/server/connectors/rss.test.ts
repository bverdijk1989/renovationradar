import { describe, it, expect } from "vitest";
import type { SearchProfile, Source } from "@prisma/client";
import { RssConnector } from "./rss";
import { MockTransport } from "./transport";
import { NoopRateLimiter } from "./rate-limit";

function source(over: Partial<Source> = {}): Source {
  return {
    id: "s1",
    name: "Example RSS",
    country: "FR",
    website: "https://example.com",
    sourceType: "rss",
    collectionMethods: ["rss"],
    status: "active",
    robotsStatus: "allows",
    termsStatus: "allows",
    legalStatus: "green",
    lastCheckedAt: null,
    notes: null,
    connectorConfig: { feedUrl: "https://example.com/feed.xml" } as never,
    rateLimitPerMinute: 30,
    userAgent: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as Source;
}

const RSS_FIXTURE = `<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Test feed</title>
    <language>fr</language>
    <item>
      <title>Moulin à eau à rénover</title>
      <link>https://example.com/listings/1</link>
      <description><![CDATA[Watermolen op 1,8 ha. 185.000 €]]></description>
      <pubDate>Mon, 05 May 2026 09:30:00 GMT</pubDate>
      <guid>moulin-1</guid>
      <category>moulin</category>
    </item>
    <item>
      <title>Maison récente, 600 m² terrain</title>
      <link>https://example.com/listings/2</link>
      <description>Pas à rénover</description>
      <pubDate>Tue, 06 May 2026 09:30:00 GMT</pubDate>
      <guid>maison-2</guid>
    </item>
  </channel>
</rss>`;

const ATOM_FIXTURE = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom feed</title>
  <entry>
    <title>Hoeve te koop</title>
    <link href="https://example.com/entry/1" rel="alternate" />
    <id>urn:hoeve-1</id>
    <summary>Boerderij op 12.000 m²</summary>
    <published>2026-05-01T10:00:00Z</published>
  </entry>
</feed>`;

describe("RssConnector", () => {
  const c = new RssConnector();

  it("canHandle accepts rss-type sources", () => {
    expect(c.canHandle(source())).toBe(true);
    expect(
      c.canHandle(source({ sourceType: "manual", collectionMethods: ["manual_entry"] })),
    ).toBe(false);
  });

  it("validateSource requires connectorConfig.feedUrl", async () => {
    const ok = await c.validateSource(source());
    expect(ok.ok).toBe(true);
    const noConfig = await c.validateSource(source({ connectorConfig: null }));
    expect(noConfig.ok).toBe(false);
    expect(noConfig.issues[0]).toMatch(/feedUrl/);
    const badUrl = await c.validateSource(
      source({ connectorConfig: { feedUrl: "not a url" } as never }),
    );
    expect(badUrl.ok).toBe(false);
  });

  it("parses an RSS 2.0 feed into RawListingDrafts", async () => {
    const drafts = await c.fetchListings(source(), null, {
      transport: new MockTransport({
        "https://example.com/feed.xml": { body: RSS_FIXTURE },
      }),
      rateLimiter: new NoopRateLimiter(),
      crawlJobId: "j1",
    });
    expect(drafts).toHaveLength(2);
    expect(drafts[0]!.externalId).toBe("moulin-1");
    expect(drafts[0]!.url).toBe("https://example.com/listings/1");
    expect(drafts[0]!.payload.title).toBe("Moulin à eau à rénover");
    expect(drafts[0]!.payload.description).toContain("Watermolen op 1,8 ha");
    expect(drafts[0]!.language).toBe("fr"); // from <language>
  });

  it("parses an Atom feed too", async () => {
    const drafts = await c.fetchListings(
      source({
        connectorConfig: { feedUrl: "https://example.com/atom.xml" } as never,
      }),
      null,
      {
        transport: new MockTransport({
          "https://example.com/atom.xml": { body: ATOM_FIXTURE },
        }),
        rateLimiter: new NoopRateLimiter(),
        crawlJobId: "j1",
      },
    );
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.externalId).toBe("urn:hoeve-1");
    expect(drafts[0]!.url).toBe("https://example.com/entry/1");
    expect(drafts[0]!.payload.title).toBe("Hoeve te koop");
  });

  it("profile filter only keeps items matching the profile's terms", async () => {
    const profile: SearchProfile = {
      id: "p1",
      name: "FR · à rénover",
      country: "FR",
      language: "fr",
      category: "general",
      terms: ["à rénover", "moulin"],
      active: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const drafts = await c.fetchListings(source(), profile, {
      transport: new MockTransport({
        "https://example.com/feed.xml": { body: RSS_FIXTURE },
      }),
      rateLimiter: new NoopRateLimiter(),
      crawlJobId: "j1",
    });
    // Only the moulin item matches both terms.
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.externalId).toBe("moulin-1");
  });

  it("throws ParseError on non-XML body", async () => {
    await expect(
      c.fetchListings(source(), null, {
        transport: new MockTransport({
          "https://example.com/feed.xml": { body: "<html>not xml</html>" },
        }),
        rateLimiter: new NoopRateLimiter(),
        crawlJobId: "j1",
      }),
    ).rejects.toThrow(/Response does not look like/i);
  });
});
