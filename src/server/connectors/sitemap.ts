import type { SearchProfile, Source } from "@prisma/client";
import type {
  FetchContext,
  RawListingDraft,
  SourceConnector,
  SourceValidationResult,
} from "./types";
import { assertXmlLooksValid, readTag, splitBlocks } from "./xml";
import { extractCandidateLinks, extractTitle } from "./link-extract";

/**
 * Deny-list voor sitemap entries die nooit een individuele property
 * vertegenwoordigen: agency/kantoor profielen, blog-artikelen, account
 * pagina's, etc. Sites zetten deze in hun sitemap voor SEO, maar wij
 * willen ze niet als RawListing aanmaken.
 */
const PATH_DENY_LIST = [
  /\/(kantoor|agence|agency|agent|office|equipe|team)\//i,
  /\/(blog|news|article|actualit[eé]s?|nieuws|press)\//i,
  /\/(over[-_]?ons|about|contact|equipe|team)/i,
  /\/(login|account|wachtwoord|password|inschrijven)/i,
  /\/(wp-content|wp-admin|cgi-bin)\//i,
];

function isAllowedPath(loc: string): boolean {
  try {
    const path = new URL(loc).pathname;
    return !PATH_DENY_LIST.some((re) => re.test(path));
  } catch {
    return true; // op parse-failure niet blokkeren, downstream regelt 'm
  }
}

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
      followLinks?: boolean;
      maxEntries?: number;
    };
    if (!cfg.sitemapUrl) return [];

    // Bij followLinks=true fetcht hij elke <url> + extract'ert detail-links.
    // Veel duurder dan plain sitemap-only mode (1 fetch + ~N child fetches),
    // dus kleinere default cap zodat één cron-run binnen 30 min blijft.
    const defaultCap = cfg.followLinks ? 100 : 1_000;
    const maxEntries = Math.max(1, Math.min(50_000, cfg.maxEntries ?? defaultCap));
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
    cfg: { urlPattern?: string; followIndex?: boolean; followLinks?: boolean },
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
    const followLinks = cfg.followLinks === true;

    // Early-quit guard voor followLinks mode: als N opeenvolgende
    // city-pages 0 detail-links opleveren is de site waarschijnlijk
    // JS-rendered en heeft verder doorgaan geen zin. Voorkomt 30-min
    // hangs op portals als Century21 BE / Immoweb.
    let consecutiveEmpty = 0;
    const MAX_CONSECUTIVE_EMPTY = 5;

    for (const block of entries) {
      if (out.length >= maxEntries) break;
      if (followLinks && consecutiveEmpty >= MAX_CONSECUTIVE_EMPTY) {
        break;
      }
      const loc = readTag(block, "loc");
      if (!loc) continue;
      if (cfg.urlPattern && !loc.includes(cfg.urlPattern)) continue;
      if (!isAllowedPath(loc)) continue;
      const lastmod = readTag(block, "lastmod");

      if (profile) {
        // Sitemaps dragen geen titels — alleen filter op URL-substrings.
        if (!profile.terms.some((t) => loc.toLowerCase().includes(t.toLowerCase()))) {
          continue;
        }
      }

      if (followLinks) {
        // Depth-2: deze sitemap-entry is een index/city-page. Fetch 'm en
        // emit elke individuele property-link binnen als RawListing met
        // de raw HTML (zelfde shape als de HTML-scraper). Normalize-stap
        // pakt 'm dan op via het html-generic pad.
        if (out.length >= maxEntries) break;
        await ctx.rateLimiter.wait(source.id, source.rateLimitPerMinute ?? 30);
        try {
          const indexRes = await ctx.transport.get(loc, {
            signal: ctx.signal,
            headers: source.userAgent
              ? { "User-Agent": source.userAgent }
              : undefined,
          });
          const indexBaseUrl = new URL(indexRes.url ?? loc);
          const remaining = maxEntries - out.length;
          const { details } = extractCandidateLinks(
            indexRes.body,
            indexBaseUrl,
            remaining,
            0, // depth-2; geen derde laag
          );

          // Track empty city-pages voor early-quit (JS-rendered detection).
          if (details.size === 0) {
            consecutiveEmpty++;
            continue;
          }
          consecutiveEmpty = 0;

          // Per detail-URL: fetch en bewaar HTML zodat normalize echte
          // velden kan extracten. Sommige sites zijn JS-rendered; voor
          // die levert dit alsnog "kale" HTML zonder property-fields,
          // maar daar kan een latere per-site parser nog op werken.
          for (const detailUrl of details) {
            if (out.length >= maxEntries) break;
            await ctx.rateLimiter.wait(source.id, source.rateLimitPerMinute ?? 30);
            try {
              const detailRes = await ctx.transport.get(detailUrl, {
                signal: ctx.signal,
                headers: source.userAgent
                  ? { "User-Agent": source.userAgent }
                  : undefined,
              });
              out.push({
                externalId: detailUrl,
                url: detailUrl,
                payload: {
                  source: "html-generic",
                  kind: "detail",
                  sitemapUrl: url,
                  indexUrl: loc,
                  title: extractTitle(detailRes.body),
                  html: truncateHtml(detailRes.body, 200_000),
                },
                language: null,
              });
            } catch {
              continue;
            }
          }
        } catch {
          // Eén falende index-page mag niet de hele run stoppen.
          continue;
        }
      } else {
        // Default: emit de sitemap-URL als-is (URL-only payload).
        out.push({
          externalId: loc,
          url: loc,
          payload: {
            source: "sitemap",
            sitemapUrl: url,
            loc,
            lastmod,
          },
          language: null,
        });
      }
    }
  }
}

function truncateHtml(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…[truncated ${s.length - max}b]` : s;
}
