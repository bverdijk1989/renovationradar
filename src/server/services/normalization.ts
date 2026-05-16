import "server-only";
import type { Country, Language, Prisma, RawListing } from "@prisma/client";
import { prisma } from "@/lib/db";
import { normalize } from "../normalization";
import type {
  NormalizationDraft,
  NormalizationInput,
} from "../normalization/types";

/**
 * Lopen over alle nog-niet-verwerkte RawListings en omzetten naar
 * NormalizedListings via de rule-based extractor.
 *
 * Per RawListing:
 *   1. Build NormalizationInput uit payload (RSS/Sitemap/HTML shape verschilt).
 *   2. normalize() → draft.
 *   3. Persist als NormalizedListing + link raw_listing.normalized_listing_id.
 *   4. Markeer raw_listing.processed_at zodat we niet opnieuw verwerken.
 *
 * Failure-modus: één rij die kapot gaat zet `processing_error`, maar de loop
 * stopt niet — andere rijen krijgen wel hun kans.
 *
 * Scoring + geocoding worden hier NIET getriggerd; dat zijn aparte stappen
 * die straks na deze service draaien (/api/scoring/recalculate, /api/listings/[id]/geocode).
 */
export type NormalizePendingResult = {
  totalCandidates: number;
  succeeded: number;
  failed: number;
  startedAt: string;
  finishedAt: string;
};

export async function normalizePending(
  limit = 200,
): Promise<NormalizePendingResult> {
  const startedAt = new Date();
  const candidates = await prisma.rawListing.findMany({
    where: { processedAt: null, normalizedListingId: null },
    include: { source: true },
    take: limit,
    orderBy: { fetchedAt: "asc" },
  });

  let succeeded = 0;
  let failed = 0;

  for (const raw of candidates) {
    try {
      const input = buildNormalizationInput(raw, raw.source.country);
      if (!input) {
        // Skip-only payloads (sitemap entries zonder content) blijven liggen.
        await prisma.rawListing.update({
          where: { id: raw.id },
          data: {
            processedAt: new Date(),
            processingError: "skipped: insufficient payload to normalize",
          },
        });
        continue;
      }

      const draft = await normalize(input);

      const created = await prisma.$transaction(async (tx) => {
        const listing = await tx.normalizedListing.create({
          data: draftToCreateInput(draft),
        });
        if (draft.media.length > 0) {
          await tx.listingMedia.createMany({
            data: draft.media.map((m, i) => ({
              normalizedListingId: listing.id,
              url: m.url,
              caption: m.caption,
              sortOrder: i,
            })),
          });
        }
        await tx.rawListing.update({
          where: { id: raw.id },
          data: {
            processedAt: new Date(),
            normalizedListingId: listing.id,
            processingError: null,
          },
        });
        return listing;
      });

      if (created) succeeded++;
    } catch (e) {
      failed++;
      await prisma.rawListing
        .update({
          where: { id: raw.id },
          data: {
            processedAt: new Date(),
            processingError: (e as Error).message.slice(0, 500),
          },
        })
        .catch(() => {});
    }
  }

  return {
    totalCandidates: candidates.length,
    succeeded,
    failed,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Per-connector payload → NormalizationInput
// ---------------------------------------------------------------------------

type RssPayload = {
  source: "rss";
  title?: string;
  description?: string;
  link?: string;
};
type SitemapPayload = {
  source: "sitemap";
  loc?: string;
  lastmod?: string;
};
type HtmlPayload = {
  source: "html-generic";
  kind?: "detail" | "index_only";
  title?: string;
  html?: string;
};

function buildNormalizationInput(
  raw: RawListing,
  country: Country,
): NormalizationInput | null {
  const payload = (raw.payload ?? {}) as Record<string, unknown>;
  const kind = typeof payload.source === "string" ? payload.source : null;

  if (kind === "rss") {
    const p = payload as unknown as RssPayload;
    const title = (p.title ?? "").trim();
    if (!title) return null;
    const fromUrl = extractAddressFromUrl(raw.url, country);
    return {
      rawListingId: raw.id,
      sourceId: raw.sourceId,
      url: raw.url,
      languageHint: raw.language,
      title,
      description: (p.description ?? null) || null,
      country,
      city: fromUrl.city,
      postalCode: fromUrl.postalCode,
    };
  }

  if (kind === "html-generic") {
    const p = payload as unknown as HtmlPayload;
    const title = (p.title ?? "").trim();
    if (!title) return null;
    // Description: probeer eerst de curated <meta name="description"> uit
    // de HTML. Dat is altijd door de site zelf gekozen tekst, schoon en
    // bondig. Body-tekst extraheren uit JS-rendered React DOM levert
    // CSS-rommel op (Emotion / styled-components inline-style hashes)
    // — niet meer proberen.
    const description = p.html ? extractMetaDescription(p.html) : null;
    const media = p.html ? extractImages(p.html, raw.url) : [];
    const fromUrl = extractAddressFromUrl(raw.url, country);
    return {
      rawListingId: raw.id,
      sourceId: raw.sourceId,
      url: raw.url,
      languageHint: raw.language,
      title,
      description,
      country,
      city: fromUrl.city,
      postalCode: fromUrl.postalCode,
      media,
    };
  }

  if (kind === "sitemap") {
    // Sitemap entries hebben alleen een URL en optionele lastmod. We bouwen
    // een NormalizationInput op basis van:
    //   - URL-slug → city + postal_code (via extractAddressFromUrl)
    //   - laatste pad-segment → fallback titel
    // De rule-based extractor levert weinig op (geen description), maar
    // de geocoder pikt city+postal wel op zodat de listing op de kaart
    // verschijnt. Detail-pagina's worden later afzonderlijk gefetcht door
    // een depth-2 HTML pass over deze URLs (toekomstige fase).
    const fromUrl = extractAddressFromUrl(raw.url, country);
    const title = buildTitleFromUrl(raw.url) ?? raw.url;
    return {
      rawListingId: raw.id,
      sourceId: raw.sourceId,
      url: raw.url,
      languageHint: raw.language,
      title,
      description: null,
      country,
      city: fromUrl.city,
      postalCode: fromUrl.postalCode,
    };
  }

  // Onbekend payload-formaat → probeer titel/description heuristisch.
  const title =
    (typeof payload.title === "string" && payload.title.trim()) ||
    (typeof payload.name === "string" && payload.name.trim()) ||
    "";
  if (!title) return null;
  const description =
    (typeof payload.description === "string" && payload.description) ||
    (typeof payload.body === "string" && payload.body) ||
    null;
  return {
    rawListingId: raw.id,
    sourceId: raw.sourceId,
    url: raw.url,
    languageHint: raw.language,
    title,
    description,
    country,
  };
}

function draftToCreateInput(
  draft: NormalizationDraft,
): Prisma.NormalizedListingUncheckedCreateInput {
  return {
    sourceId: draft.sourceId,
    originalUrl: draft.originalUrl,
    titleOriginal: draft.titleOriginal,
    titleNl: draft.titleNl,
    descriptionOriginal: draft.descriptionOriginal,
    descriptionNl: draft.descriptionNl,
    language: draft.language as Language,
    priceEur: draft.priceEur,
    propertyType: draft.propertyType,
    renovationStatus: draft.renovationStatus,
    isSpecialObject: draft.isSpecialObject,
    specialObjectType: draft.specialObjectType,
    isDetached: draft.isDetached,
    landAreaM2: draft.landAreaM2,
    livingAreaM2: draft.livingAreaM2,
    rooms: draft.rooms,
    electricityStatus: draft.electricityStatus,
    waterStatus: draft.waterStatus,
    country: draft.country,
    city: draft.city,
    region: draft.region,
    postalCode: draft.postalCode,
    addressLine: draft.addressLine,
    processingStatus: "normalized",
    availability: "for_sale",
  };
}

/**
 * Probeer city + (optioneel) postcode uit de URL-slug te trekken. Drie
 * gangbare URL-patterns voor property-pages:
 *
 *   1. city+postal samen:
 *        BE: /nl/te-koop/huis/tournai-7500   → city=Tournai, postal=7500
 *        FR: /annonce/75001-paris-...        → city=Paris, postal=75001
 *
 *   2. city als eigen segment na property-type keyword:
 *        BE: /nl/pand/te-koop/huis/sint-idesbald/<id>  → city=Sint-Idesbald
 *        FR: /properiete/a-vendre/maison/glabbeek/<id> → city=Glabbeek
 *
 *   3. (geen match) — retourneert lege object.
 *
 * Postcode-only-uit-URL is genoeg voor de geocoder; city-only is iets
 * minder precies maar werkt prima voor Belgische / Nederlandse / FR /
 * DE gemeenten via Nominatim.
 */
function extractAddressFromUrl(
  url: string,
  country: Country,
): { city?: string; postalCode?: string } {
  let pathname: string;
  try {
    pathname = new URL(url).pathname.toLowerCase();
  } catch {
    return {};
  }

  // Pattern 1: city+postal samen
  const digits = country === "FR" || country === "DE" ? "5" : "4";
  const numWord = new RegExp(`\\b(\\d{${digits}})[-_/]([a-z][a-z-]{2,})`, "i");
  const wordNum = new RegExp(`\\b([a-z][a-z-]{2,})[-_/](\\d{${digits}})\\b`, "i");

  let match = pathname.match(numWord);
  if (match) {
    return { postalCode: match[1], city: titleCase(match[2]!) };
  }
  match = pathname.match(wordNum);
  if (match) {
    return { postalCode: match[2], city: titleCase(match[1]!) };
  }

  // Pattern 2: city als segment direct na property-type keyword.
  // Property-type keywords (volledig path-segment, niet substring).
  // BELANGRIJK: alleen "concrete" property-typen — geen woorden als
  // "propriete"/"properiete" die op een LISTING-categorie wijzen
  // (`/fr/properiete/a-vendre/maison/...` — pas `maison` is het echte
  // type, niet "properiete").
  const PROPERTY_TYPE_KEYWORDS = new Set([
    "huis", "huizen", "woning", "woningen", "villa",
    "appartement", "appartements", "apartment",
    "maison", "maisons",
    "haus", "häuser", "wohnung", "wohnungen",
    "house", "houses",
  ]);
  const segments = pathname.split("/").filter(Boolean);
  // Pak de LAATSTE match — die staat het dichtst bij het property-ID,
  // dus het volgende segment is bijna altijd de city.
  for (let i = segments.length - 2; i >= 0; i--) {
    if (PROPERTY_TYPE_KEYWORDS.has(segments[i]!)) {
      const candidate = segments[i + 1]!;
      const digitCount = (candidate.match(/\d/g) ?? []).length;
      if (digitCount >= 3) continue;
      if (candidate.length < 3) continue;
      return { city: titleCase(candidate) };
    }
  }

  return {};
}

/**
 * Bouw een leesbare titel uit de URL-slug als de connector er geen kon
 * leveren (typisch het geval voor sitemap entries).
 *
 *   /nl/te-koop/huis/tournai-7500 → "Te Koop Huis · Tournai 7500"
 *   /property/grand-domaine-12345 → "Property · Grand Domaine 12345"
 */
function buildTitleFromUrl(url: string): string | null {
  try {
    const path = new URL(url).pathname;
    const segments = path.split("/").filter(Boolean);
    if (segments.length === 0) return null;
    const last = segments[segments.length - 1]!;
    const pretty = last.replace(/[-_]/g, " ").trim();
    return pretty
      .split(" ")
      .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ""))
      .join(" ")
      .trim() || null;
  } catch {
    return null;
  }
}

/**
 * Pak de inhoud van <meta name="description" content="…"> uit een HTML
 * document. Sites schrijven daar bondige, voor-mensen-bedoelde tekst,
 * bv. "Huis te koop in Glabbeek - 3 slaapkamers, 250 m², ruime tuin".
 * Retourneert null als de meta-tag niet bestaat of leeg is.
 */
function extractMetaDescription(html: string): string | null {
  // Zowel <meta name="description"> als <meta property="og:description">.
  const patterns = [
    /<meta[^>]+\bname=["']description["'][^>]*\bcontent=["']([^"']+)["']/i,
    /<meta[^>]+\bcontent=["']([^"']+)["'][^>]*\bname=["']description["']/i,
    /<meta[^>]+\bproperty=["']og:description["'][^>]*\bcontent=["']([^"']+)["']/i,
    /<meta[^>]+\bcontent=["']([^"']+)["'][^>]*\bproperty=["']og:description["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      const text = decodeHtmlEntities(m[1].trim());
      if (text.length >= 10) return text.slice(0, 2_000);
    }
  }
  return null;
}

/**
 * Pak property-foto's uit een HTML page:
 *   1. <meta property="og:image" content="..."> — door de site gecuratet,
 *      always de hoofd-listing-foto. Bijna alle real-estate sites zetten
 *      dit voor Facebook/Twitter sharing.
 *   2. <img src="..."> tags die er als property-foto's uitzien:
 *      - HTTPS URLs
 *      - Niet evident icons/logos/avatars (filter op pad-keywords)
 *      - Geen data: URLs
 *      - Geen base64 inline images
 *
 * Maxes op 8 images om DB-rows te beperken. Resolved relative URLs
 * tegen de page-URL.
 */
function extractImages(
  html: string,
  pageUrl: string,
): Array<{ url: string; caption: string | null }> {
  const out: Array<{ url: string; caption: string | null }> = [];
  const seen = new Set<string>();
  let baseUrl: URL;
  try {
    baseUrl = new URL(pageUrl);
  } catch {
    return [];
  }

  // 1. og:image — eerste prioriteit.
  const ogPatterns = [
    /<meta[^>]+\bproperty=["']og:image["'][^>]*\bcontent=["']([^"']+)["']/gi,
    /<meta[^>]+\bcontent=["']([^"']+)["'][^>]*\bproperty=["']og:image["']/gi,
    /<meta[^>]+\bname=["']twitter:image["'][^>]*\bcontent=["']([^"']+)["']/gi,
  ];
  for (const re of ogPatterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null && out.length < 8) {
      const absolute = absolutizeUrl(m[1]!, baseUrl);
      if (absolute && !seen.has(absolute) && isLikelyPropertyImage(absolute)) {
        seen.add(absolute);
        out.push({ url: absolute, caption: null });
      }
    }
  }

  // 2. <img src> tags — gangbare images.
  const imgRe = /<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) !== null && out.length < 8) {
    const absolute = absolutizeUrl(m[1]!, baseUrl);
    if (absolute && !seen.has(absolute) && isLikelyPropertyImage(absolute)) {
      seen.add(absolute);
      out.push({ url: absolute, caption: null });
    }
  }

  // 3. <img data-src> tags — lazy-loaded images (modern React apps).
  const lazyImgRe = /<img\b[^>]*\bdata-src=["']([^"']+)["'][^>]*>/gi;
  while ((m = lazyImgRe.exec(html)) !== null && out.length < 8) {
    const absolute = absolutizeUrl(m[1]!, baseUrl);
    if (absolute && !seen.has(absolute) && isLikelyPropertyImage(absolute)) {
      seen.add(absolute);
      out.push({ url: absolute, caption: null });
    }
  }

  // 4. CSS background-image: url(...) — Century21 BE, Immoweb, andere
  //    moderne portals zetten property-foto's via background-image i.p.v.
  //    <img>. Match url('...'), url("..."), of url(...) zonder quotes.
  const bgRe = /background-image\s*:\s*url\s*\(\s*['"]?([^'")]+?)['"]?\s*\)/gi;
  while ((m = bgRe.exec(html)) !== null && out.length < 8) {
    const absolute = absolutizeUrl(m[1]!, baseUrl);
    if (absolute && !seen.has(absolute) && isLikelyPropertyImage(absolute)) {
      seen.add(absolute);
      out.push({ url: absolute, caption: null });
    }
  }

  return out;
}

function absolutizeUrl(href: string, base: URL): string | null {
  if (!href || href.startsWith("data:")) return null;
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

// Heuristiek: filter icons/logos/sprites/avatars/favicons uit. Echte
// property-foto's eindigen meestal op .jpg/.jpeg/.webp en bevatten
// vaak "photo"/"listing"/"property"/"property-image" in pad. We doen
// niet té strikt — beter een paar logos er per ongeluk in dan échte
// foto's te missen.
const ICON_LIKE = /\/(icon|logo|sprite|avatar|favicon|placeholder|spinner|loader)/i;
const SMALL_IMAGE_HINT = /[-_](thumb|small|s\d+x\d+|16x16|32x32|64x64)\b/i;

function isLikelyPropertyImage(url: string): boolean {
  if (!/^https?:\/\//i.test(url)) return false;
  if (ICON_LIKE.test(url)) return false;
  if (SMALL_IMAGE_HINT.test(url)) return false;
  // SVG en GIF zijn meestal UI-assets, geen property-foto's.
  if (/\.(svg|gif)(\?|$)/i.test(url)) return false;
  return true;
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'");
}

function titleCase(slug: string): string {
  return slug
    .split("-")
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ""))
    .join(" ")
    .trim();
}

/**
 * Strip HTML naar leesbare tekst voor de rule-based extractor / display.
 *
 * Verwijdert in volgorde:
 *   1. <script>, <style>, <noscript>, <svg> blokken (incl. inhoud)
 *   2. CSS-in-JS class-definities die als platte tekst doorlekken
 *      (Emotion / styled-components hash classes als
 *      `_9112aa7acc...{color:#252526;...}`)
 *   3. Alle overgebleven HTML-tags
 *   4. HTML entities → echte chars
 *   5. Whitespace normaliseren
 */
function stripHtml(s: string): string {
  return s
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    // CSS-class-definities die als platte tekst in de HTML belanden
    // (Emotion / styled-components hash classes). Drie passes:
    //   1. Volledig blok: selector { rules } in één regex
    //   2. Alle losstaande {...} blokken (selectorless of multi-selector)
    //   3. Achtergebleven losse class-selectors: `.hashedClass,` of
    //      `_hash6charsplus` zonder context — typisch 12+ chars hex/alnum.
    .replace(/[._#][a-z0-9_-]{4,}\s*\{[^{}]*\}/gi, " ")
    .replace(/\{[^{}]{0,5000}\}/g, " ")
    .replace(/[._][a-z0-9_-]{12,}/gi, " ")
    .replace(/\s*,\s*(?=\s|$)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
