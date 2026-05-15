import type { Language, SearchProfile, Source } from "@prisma/client";
import {
  FetchContext,
  RawListingDraft,
  SourceConnector,
  SourceValidationResult,
} from "./types";
import {
  assertXmlLooksValid,
  readAttr,
  readTag,
  splitBlocks,
} from "./xml";

/**
 * RssConnector — fetches an RSS 2.0 or Atom-style feed and converts each
 * `<item>` (RSS) or `<entry>` (Atom) into a RawListingDraft.
 *
 * The connector trusts the connectorConfig for routing:
 *   {
 *     "feedUrl": "https://example.com/feed.xml",
 *     "language": "fr",        // optional override; otherwise from <language>
 *   }
 *
 * If `feedUrl` is missing, validation fails — no falling back to website,
 * because that's almost always wrong for RSS.
 */
export class RssConnector implements SourceConnector {
  readonly name = "rss-v1";
  readonly sourceType = "rss" as const;

  canHandle(source: Source): boolean {
    return (
      source.sourceType === "rss" ||
      source.collectionMethods.includes("rss")
    );
  }

  async validateSource(source: Source): Promise<SourceValidationResult> {
    const issues: string[] = [];
    const warnings: string[] = [];
    const cfg = source.connectorConfig as { feedUrl?: unknown } | null;
    if (!cfg || typeof cfg.feedUrl !== "string" || cfg.feedUrl.length === 0) {
      issues.push("connectorConfig.feedUrl is required for RSS sources");
    } else {
      try {
        // eslint-disable-next-line no-new
        new URL(cfg.feedUrl);
      } catch {
        issues.push(`connectorConfig.feedUrl is not a valid URL: ${cfg.feedUrl}`);
      }
    }
    if (!source.rateLimitPerMinute) {
      warnings.push("No rateLimitPerMinute set — defaults are conservative but explicit is better");
    }
    return { ok: issues.length === 0, issues, warnings };
  }

  async fetchListings(
    source: Source,
    profile: SearchProfile | null,
    ctx: FetchContext,
  ): Promise<RawListingDraft[]> {
    const cfg = (source.connectorConfig ?? {}) as { feedUrl?: string; language?: Language };
    if (!cfg.feedUrl) {
      // Defensive: validateSource should have caught this.
      return [];
    }

    const res = await ctx.transport.get(cfg.feedUrl, {
      signal: ctx.signal,
      headers: source.userAgent ? { "User-Agent": source.userAgent } : undefined,
    });
    assertXmlLooksValid(res.body, /<rss/i.test(res.body) ? "rss" : "feed");

    const feedLanguage =
      cfg.language ?? (readTag(res.body, "language")?.slice(0, 2) as Language | undefined);

    const items = isRss(res.body)
      ? parseRssItems(res.body)
      : parseAtomEntries(res.body);

    // If a profile is supplied, keep only items whose title or description
    // mentions at least one of the profile terms (case-insensitive). This
    // lets connectors be re-used for narrow search profiles. No profile
    // means "everything".
    const filtered = profile ? items.filter((i) => matchesProfile(i, profile)) : items;

    return filtered.map((i) => ({
      externalId: i.guid ?? i.link ?? null,
      url: i.link ?? cfg.feedUrl!,
      payload: {
        source: "rss",
        feedUrl: cfg.feedUrl,
        title: i.title,
        link: i.link,
        description: i.description,
        publishedAt: i.publishedAt,
        guid: i.guid,
        categories: i.categories,
        enclosureUrl: i.enclosureUrl,
        raw: i.raw,
      },
      language: i.language ?? feedLanguage ?? null,
    }));
  }
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------

type FeedItem = {
  title: string;
  link: string | null;
  description: string | null;
  publishedAt: string | null;
  guid: string | null;
  categories: string[];
  enclosureUrl: string | null;
  language: Language | null;
  raw: string;
};

function isRss(body: string): boolean {
  return /<rss\b/i.test(body) || /<channel\b/i.test(body);
}

function parseRssItems(body: string): FeedItem[] {
  return splitBlocks(body, "item").map((block) => {
    const categories = splitBlocks(block, "category")
      .map((b) => readTag(b, "category"))
      .filter((s): s is string => !!s);
    return {
      title: readTag(block, "title") ?? "",
      link: readTag(block, "link"),
      description: readTag(block, "description"),
      publishedAt: readTag(block, "pubDate") ?? readTag(block, "date"),
      guid: readTag(block, "guid"),
      categories,
      enclosureUrl: readAttr(block, "enclosure", "url"),
      language: null,
      raw: block,
    };
  });
}

function parseAtomEntries(body: string): FeedItem[] {
  return splitBlocks(body, "entry").map((block) => {
    return {
      title: readTag(block, "title") ?? "",
      link: readAttr(block, "link", "href"),
      description: readTag(block, "summary") ?? readTag(block, "content"),
      publishedAt: readTag(block, "published") ?? readTag(block, "updated"),
      guid: readTag(block, "id"),
      categories: splitBlocks(block, "category")
        .map((b) => readAttr(b, "category", "term"))
        .filter((s): s is string => !!s),
      enclosureUrl: null,
      language: null,
      raw: block,
    };
  });
}

function matchesProfile(item: FeedItem, profile: SearchProfile): boolean {
  const haystack = `${item.title}\n${item.description ?? ""}`.toLowerCase();
  return profile.terms.some((t) => haystack.includes(t.toLowerCase()));
}
