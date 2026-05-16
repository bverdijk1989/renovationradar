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
    return {
      rawListingId: raw.id,
      sourceId: raw.sourceId,
      url: raw.url,
      languageHint: raw.language,
      title,
      description: (p.description ?? null) || null,
      country,
    };
  }

  if (kind === "html-generic") {
    const p = payload as unknown as HtmlPayload;
    const title = (p.title ?? "").trim();
    if (!title) return null;
    // Description: extract body text from raw HTML (very lossy maar geeft de
    // rule-based extractor wat hooi). Cap op 5kB om regex-tijd te beperken.
    const description = p.html
      ? stripHtml(p.html.slice(0, 50_000)).slice(0, 5_000) || null
      : null;
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

  if (kind === "sitemap") {
    // Sitemap entries hebben alleen een URL — niet voldoende voor de extractor.
    // We laten 'm liggen tot een HTML-scrape de details ophaalt.
    return null;
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

function stripHtml(s: string): string {
  return s
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
