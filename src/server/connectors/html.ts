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
  nl: /\/(te[-_]?koop|huis|woning|opknap|aanbod|aanbieding|chateau|chateaux)\b|\/koop\//i,
  fr: /\/(a[-_]?vendre|vente|maison|propriete|propriété|annonce|chateau|château)\b/i,
  de: /\/(zu[-_]?verkaufen|verkauf|haus|immobilie|kaufen|angebot)\b/i,
  en: /\/(for[-_]?sale|house|property|listing|chateau)\b/i,
};

const ALL_HINTS = new RegExp(
  Object.values(LISTING_LINK_HINTS_BY_LANG)
    .map((r) => r.source)
    .join("|"),
  "i",
);

/**
 * Deny-list: paden onder deze prefixes zijn nooit een individuele
 * huis-pagina (al matchen ze toevallig een keyword). Houdt agency-indexen,
 * blog-artikelen en account-pages buiten de scraper-batch.
 */
const PATH_DENY_LIST = [
  /^\/agence(s)?\//i,
  /^\/agency\//i,
  /^\/makelaar(s)?\//i,
  /^\/agentschap\//i,
  /^\/blog\//i,
  /^\/news\//i,
  /^\/article\//i,
  /^\/actualit(e|é)s?\//i,
  /^\/nieuws\//i,
  /^\/wp-content\//i,
  /^\/wp-admin\//i,
  /^\/cgi-bin\//i,
  /^\/contact/i,
  /^\/about/i,
  /^\/over[-_]ons/i,
  /^\/equipe/i,
  /^\/login/i,
  /^\/mon[-_]/i,
];

/**
 * Een individuele property-pagina (in tegenstelling tot een
 * categorie/city-index) heeft ALMOST ALWAYS één van deze patterns:
 *   - Een expliciete property-marker als `ref-12345`, `property-1234`,
 *     `annonce-9876`, `bien-43` (gebruikelijk bij FR/BE/DE makelaars)
 *   - Een diep pad (5+ segmenten) — Century21 BE: `/nl/te-koop/huis/<city>/<ref>`
 *   - Een lange slug met ≥4 hyphens — meestal volledige property-titels:
 *     `/grand-domaine-rural-pres-de-rouen-12345`
 *
 * Doel: filter `/nl/te-koop/huis/tournai-7500` (city-index, 4 segments)
 * weg uit het detail-bucket en stop 'm in het index-bucket zodat depth-2
 * 'm één laag dieper verkent. Categorie-overzichten zoals `/achat/maison`
 * matchen geen van deze patterns.
 */
const ID_MARKER_RE = /\b(ref|id|property|prop|annonce|bien|haus|huis|maison|villa)[-_/]?\d{2,}/i;
const DEEP_PATH_RE = /^\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/[^/]/;
const LONG_SLUG_RE = /\/[a-z0-9]+(?:-[a-z0-9]+){4,}/i;

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
    //    `details` = URLs die direct op een individuele property-pagina lijken
    //    `indexes` = URLs die op een tussenliggende lijst-/categoriepagina lijken
    //                (Century21 BE: /nl/te-koop/huis/tournai-7500 → daarop staan
    //                 echte property-refs)
    const baseUrl = new URL(startRes.url ?? startUrl);
    const { details: detailUrls, indexes: indexUrls } = extractCandidateLinks(
      startRes.body,
      baseUrl,
      maxListings,
      maxIndexPages,
    );

    // 3. Voor elke index-page één laag dieper: lever de detail-links die
    //    daar staan. Dit is wat depth-2 toelevert. Per index-page rate-limit
    //    we volgens dezelfde policy als detail-fetches.
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

    // 4. Geen specifieke detail-links gevonden → fallback: lever de start-page
    //    zelf als index_only zodat normalisatie tenminste iets te zien krijgt.
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
 * Zoek <a href="..."> tags en categoriseer ze:
 *   - `details` = URLs die individuele property-pagina's lijken (specifieke
 *      ID/slug, geen tussenliggende index)
 *   - `indexes` = URLs die naar een lijst-pagina wijzen (keyword match maar
 *      generiek pad — bv. `/te-koop/huis/tournai-7500` toont alle huizen
 *      per stad bij Century21 BE)
 *
 * Beide gefilterd op de deny-list, same-host, deduplicated.
 */
function extractCandidateLinks(
  html: string,
  baseUrl: URL,
  maxDetails: number,
  maxIndexes: number,
): { details: Set<string>; indexes: Set<string> } {
  const details = new Set<string>();
  const indexes = new Set<string>();
  const seenHrefs = new Set<string>();
  let m: RegExpExecArray | null;
  HREF_RE.lastIndex = 0;
  while ((m = HREF_RE.exec(html)) !== null) {
    if (details.size >= maxDetails && indexes.size >= maxIndexes) break;
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
    if (abs.host !== baseUrl.host) continue;

    const path = abs.pathname;
    const pathAndQuery = `${path}${abs.search}`;

    // Deny-list eerst.
    if (PATH_DENY_LIST.some((re) => re.test(path))) continue;

    const matchesUrl = ALL_HINTS.test(pathAndQuery);
    const matchesText =
      text.length >= 3 &&
      (text.includes("te koop") ||
        text.includes("a vendre") ||
        text.includes("à vendre") ||
        text.includes("for sale") ||
        text.includes("zu verkaufen") ||
        text.includes("zum verkauf"));

    if (!matchesUrl && !matchesText) continue;

    // Classify: detail-page vs index-page (city-overzicht, agency-overzicht).
    const isDetail =
      ID_MARKER_RE.test(path) ||
      DEEP_PATH_RE.test(path) ||
      LONG_SLUG_RE.test(path);

    if (isDetail) {
      if (details.size < maxDetails) details.add(abs.toString());
    } else {
      // Géén markers → index-pagina. Depth-2 crawl pakt 'm op als de caller
      // dat heeft aangevraagd (maxIndexes > 0).
      if (indexes.size < maxIndexes) indexes.add(abs.toString());
    }
  }
  return { details, indexes };
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
