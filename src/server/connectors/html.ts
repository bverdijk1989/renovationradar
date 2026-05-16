import type { SearchProfile, Source } from "@prisma/client";
import { ParseError } from "./errors";
import type {
  FetchContext,
  RawListingDraft,
  SourceConnector,
  SourceValidationResult,
} from "./types";
import { extractCandidateLinks, extractTitle } from "./link-extract";

/**
 * PermittedHtmlConnector — generieke HTML-scraper voor bronnen die expliciet
 * toestemming hebben gegeven om gescraped te worden (legal gate: status=active
 * + legalStatus=green + collectionMethods.scrape_with_permission).
 *
 * Strategie:
 *   1. Start op connectorConfig.listingPageUrl als die er is, anders source.website.
 *   2. Fetch die pagina.
 *   3. extractCandidateLinks: splits in detail-URLs + index-URLs.
 *   4. Voor elke index (max maxIndexPages, default 10): fetch, extract details
 *      die daar staan, voeg toe aan totaal (depth-2 crawl).
 *   5. Fetch elke detail-page tot maxListings cap.
 *
 * Site-specifieke scrapers (Cheerio + selectors) kunnen later als subclass
 * komen via een eigen connector-type ("scrape_custom").
 */
export class PermittedHtmlConnector implements SourceConnector {
  readonly name = "html-generic-v1";
  readonly sourceType = "scrape" as const;

  canHandle(source: Source): boolean {
    return (
      source.sourceType === "scrape" ||
      source.collectionMethods.includes("scrape_with_permission")
    );
  }

  async validateSource(source: Source): Promise<SourceValidationResult> {
    const issues: string[] = [];
    const warnings: string[] = [];

    if (!source.collectionMethods.includes("scrape_with_permission")) {
      issues.push(
        "Source moet 'scrape_with_permission' in collectionMethods hebben.",
      );
    }
    if (source.legalStatus !== "green") {
      issues.push(
        "Source legalStatus moet 'green' zijn (toestemming bevestigd in review).",
      );
    }
    const cfg = (source.connectorConfig ?? {}) as {
      listingPageUrl?: unknown;
      maxListings?: unknown;
    };
    if (cfg.listingPageUrl != null && typeof cfg.listingPageUrl !== "string") {
      issues.push("connectorConfig.listingPageUrl moet een string zijn.");
    }
    if (cfg.listingPageUrl) {
      try {
        // eslint-disable-next-line no-new
        new URL(cfg.listingPageUrl as string);
      } catch {
        issues.push(`connectorConfig.listingPageUrl is geen geldige URL.`);
      }
    }
    if (!source.rateLimitPerMinute) {
      warnings.push(
        "Geen rateLimitPerMinute — scraper gebruikt 30/min default, overweeg expliciet zetten.",
      );
    }
    return { ok: issues.length === 0, issues, warnings };
  }

  async fetchListings(
    source: Source,
    _profile: SearchProfile | null,
    ctx: FetchContext,
  ): Promise<RawListingDraft[]> {
    const cfg = (source.connectorConfig ?? {}) as {
      listingPageUrl?: string;
      maxListings?: number;
      maxIndexPages?: number;
    };
    const startUrl = cfg.listingPageUrl ?? source.website;
    const maxListings = Math.max(1, Math.min(500, cfg.maxListings ?? 50));
    const maxIndexPages = Math.max(0, Math.min(20, cfg.maxIndexPages ?? 10));

    // 1. Fetch start page.
    const startRes = await ctx.transport.get(startUrl, {
      signal: ctx.signal,
      headers: source.userAgent ? { "User-Agent": source.userAgent } : undefined,
    });
    if (!startRes.body || startRes.body.length < 100) {
      throw new ParseError(`Lege/te korte response van ${startUrl}`);
    }

    // 2. Extract level-1 candidates.
    const baseUrl = new URL(startRes.url ?? startUrl);
    const { details: detailUrls, indexes: indexUrls } = extractCandidateLinks(
      startRes.body,
      baseUrl,
      maxListings,
      maxIndexPages,
    );

    // 3. Voor elke index-page één laag dieper: lever de detail-links die
    //    daar staan. Dit is wat depth-2 toelevert.
    for (const idxUrl of indexUrls) {
      if (ctx.signal?.aborted) break;
      if (detailUrls.size >= maxListings) break;
      await ctx.rateLimiter.wait(source.id, source.rateLimitPerMinute ?? 30);
      try {
        const idxRes = await ctx.transport.get(idxUrl, {
          signal: ctx.signal,
          headers: source.userAgent
            ? { "User-Agent": source.userAgent }
            : undefined,
        });
        const moreDetails = extractCandidateLinks(
          idxRes.body,
          new URL(idxRes.url ?? idxUrl),
          maxListings - detailUrls.size,
          0, // depth-2 is hard genoeg; geen extra level
        ).details;
        for (const u of moreDetails) {
          detailUrls.add(u);
          if (detailUrls.size >= maxListings) break;
        }
      } catch {
        continue;
      }
    }

    // 4. Fallback: geen detail-links gevonden → lever de start-page als
    //    index_only voor diagnostics.
    if (detailUrls.size === 0) {
      return [
        {
          externalId: null,
          url: startRes.url ?? startUrl,
          payload: {
            source: "html-generic",
            kind: "index_only",
            title: extractTitle(startRes.body),
            html: truncate(startRes.body, 200_000),
          },
          language: null,
        },
      ];
    }

    // 5. Fetch elke detail-page (rate-limited).
    const drafts: RawListingDraft[] = [];
    for (const url of detailUrls) {
      if (ctx.signal?.aborted) break;
      await ctx.rateLimiter.wait(source.id, source.rateLimitPerMinute ?? 30);
      try {
        const detail = await ctx.transport.get(url, {
          signal: ctx.signal,
          headers: source.userAgent
            ? { "User-Agent": source.userAgent }
            : undefined,
        });
        drafts.push({
          externalId: url,
          url,
          payload: {
            source: "html-generic",
            kind: "detail",
            title: extractTitle(detail.body),
            html: truncate(detail.body, 200_000),
          },
          language: null,
        });
      } catch {
        continue;
      }
    }

    return drafts;
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…[truncated ${s.length - max}b]` : s;
}
