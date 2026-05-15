import type { SearchProfile, Source } from "@prisma/client";
import type {
  FetchContext,
  RawListingDraft,
  SourceConnector,
  SourceValidationResult,
} from "./types";
import { assertXmlLooksValid, readTag, splitBlocks } from "./xml";

/**
 * SitemapConnector — fetches a sitemap.xml (or sitemap-index) and emits a
 * RawListingDraft for every `<url>` entry.
 *
 * connectorConfig shape:
 *   {
 *     "sitemapUrl": "https://example.com/sitemap.xml",
 *     "urlPattern": "/property/",  // optional substring filter
 *     "followIndex": true          // optional; follow nested sitemaps
 *   }
 *
 * IMPORTANT: a sitemap entry is JUST a URL — the connector does NOT fetch
 * the underlying page. Pulling page content belongs to a downstream HTML
 * connector and is gated separately on a per-page permission audit.
 * This connector's RawListing payload contains only the URL + lastmod +
 * (if present) image — enough for the normalisation step to dedupe and
 * schedule the HTML connector.
 */
export class SitemapConnector implements SourceConnector {
  readonly name = "sitemap-v1";
  readonly sourceType = "sitemap" as const;

  canHandle(source: Source): boolean {
    return (
      source.sourceType === "sitemap" ||
      source.collectionMethods.includes("sitemap")
    );
  }

  async validateSource(source: Source): Promise<SourceValidationResult> {
    const issues: string[] = [];
    const warnings: string[] = [];
    const cfg = source.connectorConfig as { sitemapUrl?: unknown } | null;
    if (!cfg || typeof cfg.sitemapUrl !== "string" || cfg.sitemapUrl.length === 0) {
      issues.push("connectorConfig.sitemapUrl is required for sitemap sources");
    } else {
      try {
        // eslint-disable-next-line no-new
        new URL(cfg.sitemapUrl);
      } catch {
        issues.push(`connectorConfig.sitemapUrl is not a valid URL: ${cfg.sitemapUrl}`);
      }
    }
    return { ok: issues.length === 0, issues, warnings };
  }

  async fetchListings(
    source: Source,
    profile: SearchProfile | null,
    ctx: FetchContext,
  ): Promise<RawListingDraft[]> {
    const cfg = (source.connectorConfig ?? {}) as {
      sitemapUrl?: string;
      urlPattern?: string;
      followIndex?: boolean;
    };
    if (!cfg.sitemapUrl) return [];

    return await this.crawl(
      cfg.sitemapUrl,
      cfg,
      source,
      profile,
      ctx,
      new Set(),
      0,
    );
  }

  /** Recursive: handles `<sitemapindex>` ⊕ `<urlset>` */
  private async crawl(
    url: string,
    cfg: { urlPattern?: string; followIndex?: boolean },
    source: Source,
    profile: SearchProfile | null,
    ctx: FetchContext,
    seen: Set<string>,
    depth: number,
  ): Promise<RawListingDraft[]> {
    if (seen.has(url)) return [];
    if (depth > 3) return []; // hard cap — runaway sitemap chains are a smell
    seen.add(url);

    await ctx.rateLimiter.wait(source.id, source.rateLimitPerMinute);
    const res = await ctx.transport.get(url, {
      signal: ctx.signal,
      headers: source.userAgent ? { "User-Agent": source.userAgent } : undefined,
    });
    assertXmlLooksValid(res.body, "urlset");

    // Sitemap index?
    if (/<sitemapindex\b/i.test(res.body)) {
      if (!cfg.followIndex) return [];
      const childUrls = splitBlocks(res.body, "sitemap")
        .map((b) => readTag(b, "loc"))
        .filter((s): s is string => !!s);
      const out: RawListingDraft[] = [];
      for (const child of childUrls) {
        out.push(...(await this.crawl(child, cfg, source, profile, ctx, seen, depth + 1)));
      }
      return out;
    }

    // Plain urlset.
    const entries = splitBlocks(res.body, "url");
    const drafts: RawListingDraft[] = [];
    for (const block of entries) {
      const loc = readTag(block, "loc");
      if (!loc) continue;
      if (cfg.urlPattern && !loc.includes(cfg.urlPattern)) continue;
      const lastmod = readTag(block, "lastmod");
      const draft: RawListingDraft = {
        externalId: loc,
        url: loc,
        payload: {
          source: "sitemap",
          sitemapUrl: url,
          loc,
          lastmod,
        },
        language: null,
      };
      if (profile) {
        // Sitemaps don't carry titles — we can only filter on URL substrings.
        if (
          !profile.terms.some((t) => loc.toLowerCase().includes(t.toLowerCase()))
        ) {
          continue;
        }
      }
      drafts.push(draft);
    }
    return drafts;
  }
}
