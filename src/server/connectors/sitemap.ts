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
      maxEntries?: number;
    };
    if (!cfg.sitemapUrl) return [];

    const maxEntries = Math.max(1, Math.min(50_000, cfg.maxEntries ?? 1_000));
    const out: RawListingDraft[] = [];
    await this.crawl(
      cfg.sitemapUrl,
      cfg,
      source,
      profile,
      ctx,
      new Set(),
      0,
      out,
      maxEntries,
    );
    return out;
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
    out: RawListingDraft[],
    maxEntries: number,
  ): Promise<void> {
    if (seen.has(url)) return;
    if (depth > 3) return; // hard cap — runaway sitemap chains are a smell
    if (out.length >= maxEntries) return;
    seen.add(url);

    await ctx.rateLimiter.wait(source.id, source.rateLimitPerMinute);
    const res = await ctx.transport.get(url, {
      signal: ctx.signal,
      headers: source.userAgent ? { "User-Agent": source.userAgent } : undefined,
    });
    // Een geldige sitemap-response is óf een <urlset> óf een <sitemapindex>.
    // De strikte assertion op "urlset" blokkeerde index-responses helemaal.
    if (!/<urlset\b/i.test(res.body) && !/<sitemapindex\b/i.test(res.body)) {
      assertXmlLooksValid(res.body, "urlset"); // gooit met duidelijke message
    }

    // Sitemap index? Default = volg de child-sitemaps (binnen depth-cap).
    // Een sitemap-index zonder follow is per definitie nutteloos.
    if (/<sitemapindex\b/i.test(res.body)) {
      const followIndex = cfg.followIndex ?? true;
      if (!followIndex) return;
      const childUrls = splitBlocks(res.body, "sitemap")
        .map((b) => readTag(b, "loc"))
        .filter((s): s is string => !!s);
      for (const child of childUrls) {
        if (out.length >= maxEntries) break;
        await this.crawl(child, cfg, source, profile, ctx, seen, depth + 1, out, maxEntries);
      }
      return;
    }

    // Plain urlset.
    const entries = splitBlocks(res.body, "url");
    for (const block of entries) {
      if (out.length >= maxEntries) break;
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
      out.push(draft);
    }
  }
}
