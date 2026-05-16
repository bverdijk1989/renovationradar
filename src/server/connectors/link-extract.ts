/**
 * Shared link-extraction heuristieken voor de HTML- en Sitemap-scrapers.
 *
 * Doel: uit een willekeurige HTML-pagina van een makelaarssite halen welke
 * `<a href>` links naar individuele property-pagina's wijzen, en welke
 * naar lijst-/categorie-pagina's. Detail-links zijn wat we willen scrapen;
 * index-links worden eventueel één laag dieper gevolgd (depth-2).
 */

// Listing-keyword patterns per taal. Geen "huur"/"location" — alleen "te koop"-varianten.
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
 * Paden die NOOIT een individuele property zijn — agency-indexen,
 * blog-artikelen, account-pages, paginatie-/filter-pagina's, etc.
 */
export const PATH_DENY_LIST = [
  /^\/agence(s)?\//i,
  /^\/agency\//i,
  /^\/makelaar(s)?\//i,
  /^\/agentschap\//i,
  /^\/kantoor\//i,
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
  /^\/favoris/i,
  /^\/favorieten/i,
  /^\/zoek[-_]een[-_]/i,
  /^\/trouver[-_]une[-_]/i,
  /\/page\d+\//i,
];

/**
 * Een individuele property-pagina heeft typisch:
 *   - Een expliciete property-marker (`ref-12345`, `property-1234`, `annonce-9876`)
 *   - Een diep pad (5+ segmenten) — Century21 BE: `/nl/te-koop/huis/<city>/<ref>`
 *   - Een lange slug met ≥4 hyphens (`grand-domaine-rural-pres-de-rouen`)
 *
 * Anders is het een index-/categoriepagina.
 */
const ID_MARKER_RE = /\b(ref|id|property|prop|annonce|bien|haus|huis|maison|villa)[-_/]?\d{2,}/i;
const DEEP_PATH_RE = /^\/[^/]+\/[^/]+\/[^/]+\/[^/]+\/[^/]/;
const LONG_SLUG_RE = /\/[a-z0-9]+(?:-[a-z0-9]+){4,}/i;

const HREF_RE = /<a\b[^>]*\bhref\s*=\s*("([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/a>/gi;
export const TITLE_RE = /<title[^>]*>([\s\S]*?)<\/title>/i;

/**
 * Categoriseer alle <a href> in een HTML-body als detail of index.
 *
 * @param html      HTML response body
 * @param baseUrl   URL waarvandaan de body komt (voor relative-link resolve)
 * @param maxDetails Cap op `details`
 * @param maxIndexes Cap op `indexes` (0 = vertel ze niet eens)
 */
export function extractCandidateLinks(
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

    const isDetail =
      ID_MARKER_RE.test(path) ||
      DEEP_PATH_RE.test(path) ||
      LONG_SLUG_RE.test(path);

    if (isDetail) {
      if (details.size < maxDetails) details.add(abs.toString());
    } else {
      if (indexes.size < maxIndexes) indexes.add(abs.toString());
    }
  }
  return { details, indexes };
}

export function extractTitle(html: string): string | null {
  const m = TITLE_RE.exec(html);
  if (!m) return null;
  return stripTags(m[1] ?? "").trim() || null;
}

export function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}
