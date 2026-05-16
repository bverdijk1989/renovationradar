import type { SearchProfile, Source } from "@prisma/client";
import { ParseError } from "./errors";
import type {
  FetchContext,
  RawListingDraft,
  SourceConnector,
  SourceValidationResult,
} from "./types";

/**
 * PermittedHtmlConnector — generieke HTML-scraper voor bronnen die expliciet
 * toestemming hebben gegeven om gescraped te worden (legal gate: status=active
 * + legalStatus=green + collectionMethods.scrape_with_permission).
 *
 * Strategie:
 *   1. Start op connectorConfig.listingPageUrl als die er is, anders source.website.
 *   2. Fetch die pagina.
 *   3. Extract <a href="..."> links die signaalwoorden bevatten die op een
 *      huis-te-koop pagina wijzen (fr/nl/de/en).
 *   4. Dedup binnen de run + cap op connectorConfig.maxListings (default 50).
 *   5. Fetch elk detail-link (volgens rate-limit) en sla op als RawListingDraft
 *      met de raw HTML als payload — normalisatie-stap doet de echte parsing.
 *
 * NIET: site-specifieke extractie. Voor agencies met onbekende layout pakken
 * we de raw HTML en laten normalisatie het uitvogelen. Site-specifieke
 * scrapers met Cheerio + selectors kunnen later als subclass komen via een
 * eigen connector-type ("scrape_custom").
 */
const LISTING_LINK_HINTS_BY_LANG: Record<string, RegExp> = {
  nl: /\/(te[-_]?koop|huis|woning|opknap|aanbod|aanbieding)\b|\/koop\//i,
  fr: /\/(a[-_]?vendre|vente|maison|propriete|propriété|annonce)\b/i,
  de: /\/(zu[-_]?verkaufen|verkauf|haus|immobilie|kaufen|angebot)\b/i,
  en: /\/(for[-_]?sale|house|property|listing)\b/i,
};

const ALL_HINTS = new RegExp(
  Object.values(LISTING_LINK_HINTS_BY_LANG)
    .map((r) => r.source)
    .join("|"),
  "i",
);

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*("([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

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
    };
    const startUrl = cfg.listingPageUrl ?? source.website;
    const maxListings = Math.max(1, Math.min(500, cfg.maxListings ?? 50));

    // 1. Fetch start page.
    const startRes = await ctx.transport.get(startUrl, {
      signal: ctx.signal,
      headers: source.userAgent ? { "User-Agent": source.userAgent } : undefined,
    });
    if (!startRes.body || startRes.body.length < 100) {
      throw new ParseError(`Lege/te korte response van ${startUrl}`);
    }

    // 2. Extract candidate listing-page links.
    const baseUrl = new URL(startRes.url ?? startUrl);
    const candidateUrls = extractListingLinks(startRes.body, baseUrl, maxListings);

    if (candidateUrls.size === 0) {
      // Geen herkenbare listing-links gevonden. We sturen de start-page zelf
      // wel mee als RawListing zodat normalisatie 'm kan inspecteren — beter
      // dan een lege run.
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

    // 3. Fetch each detail page (rate-limited).
    const drafts: RawListingDraft[] = [];
    for (const url of candidateUrls) {
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
        // Eén falende detail-page mag niet de hele run kapotmaken.
        continue;
      }
    }

    return drafts;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Zoek <a href="..."> tags waarvan de URL of de link-tekst signaalwoorden
 * bevat ("te koop", "à vendre", "for sale", "zu verkaufen"). Resolved tegen
 * de page-URL, gefilterd op same-host, deduped, gecapt op max.
 */
function extractListingLinks(
  html: string,
  baseUrl: URL,
  max: number,
): Set<string> {
  const out = new Set<string>();
  const seenHrefs = new Set<string>();
  let m: RegExpExecArray | null;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html)) !== null) {
    const href = (m[2] ?? m[3] ?? "").trim();
    const text = stripTags(m[4] ?? "").toLowerCase();
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) {
      continue;
    }
    if (seenHrefs.has(href)) continue;
    seenHrefs.add(href);

    let abs: URL;
    try {
      abs = new URL(href, baseUrl);
    } catch {
      continue;
    }
    // Same-host enforcement: cross-domain links (zoals socials, advertenties)
    // overslaan.
    if (abs.host !== baseUrl.host) continue;

    const pathAndQuery = `${abs.pathname}${abs.search}`;
    const matchesUrl = ALL_HINTS.test(pathAndQuery);
    const matchesText =
      text.length >= 3 &&
      (text.includes("te koop") ||
        text.includes("a vendre") ||
        text.includes("à vendre") ||
        text.includes("for sale") ||
        text.includes("zu verkaufen") ||
        text.includes("zum verkauf"));

    if (matchesUrl || matchesText) {
      out.add(abs.toString());
      if (out.size >= max) break;
    }
  }
  return out;
}

function extractTitle(html: string): string | null {
  const m = TITLE_RE.exec(html);
  if (!m) return null;
  return stripTags(m[1] ?? "").trim() || null;
}

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…[truncated ${s.length - max}b]` : s;
}
