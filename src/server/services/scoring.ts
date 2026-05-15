import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { NotFoundError } from "../api/http";
import {
  DEFAULT_SCORING_CONFIG,
  scoreListing,
  type ScoringConfig,
  type ScoringInput,
  type ScoringResult,
} from "../scoring";
import { evaluateListingEvent } from "../alerts";

/**
 * Scoring service — thin wrapper around `src/server/scoring/engine.ts`.
 *
 * Responsibilities:
 *   1. Pull a NormalizedListing + its location + features from the DB.
 *   2. Convert into a `ScoringInput` (Prisma row → engine domain shape).
 *   3. Run the engine.
 *   4. Persist the result into `ListingScore` (1:1) and bump the listing's
 *      `processingStatus` to `scored`.
 *
 * `scoreListingById` scores one listing. `recalculateAllScores` cursors
 * through the DB in batches.
 *
 * Keep the public function names stable — the API routes import them
 * (`/api/listings/:id/score`, `/api/scoring/recalculate`).
 */

type ListingForScoring = Prisma.NormalizedListingGetPayload<{
  include: { location: true; features: true };
}>;

function toScoringInput(listing: ListingForScoring): ScoringInput {
  return {
    priceEur: listing.priceEur,
    landAreaM2: listing.landAreaM2,
    livingAreaM2: listing.livingAreaM2,
    propertyType: listing.propertyType,
    renovationStatus: listing.renovationStatus,
    isSpecialObject: listing.isSpecialObject,
    specialObjectType: listing.specialObjectType,
    isDetached: listing.isDetached,
    electricityStatus: listing.electricityStatus,
    waterStatus: listing.waterStatus,
    language: listing.language,
    location: listing.location
      ? { distanceFromVenloKm: listing.location.distanceFromVenloKm }
      : null,
    titleOriginal: listing.titleOriginal,
    titleNl: listing.titleNl,
    descriptionOriginal: listing.descriptionOriginal,
    descriptionNl: listing.descriptionNl,
    normalizationConfidence: pickNormalizationConfidence(listing.features),
  };
}

/**
 * Best-effort: if the normalization step left a `_normalization_confidence`
 * feature behind (fase 5+), use it. Otherwise null → scoring engine
 * falls back to its own field-completeness heuristic.
 */
function pickNormalizationConfidence(
  features: ListingForScoring["features"],
): number | null {
  const f = features.find((f) => f.key === "_normalization_confidence");
  return f?.valueNumber ?? null;
}

async function writeScore(
  listingId: string,
  result: ScoringResult,
): Promise<Prisma.ListingScoreGetPayload<true>> {
  return prisma.listingScore.upsert({
    where: { normalizedListingId: listingId },
    create: {
      normalizedListingId: listingId,
      matchScore: result.matchScore,
      renovationScore: result.renovationScore,
      specialObjectScore: result.specialObjectScore,
      dataConfidence: result.dataConfidence,
      investmentPotentialScore: result.investmentPotentialScore,
      compositeScore: result.compositeScore,
      breakdown: result.components as never,
      scorerVersion: result.scorerVersion,
    },
    update: {
      matchScore: result.matchScore,
      renovationScore: result.renovationScore,
      specialObjectScore: result.specialObjectScore,
      dataConfidence: result.dataConfidence,
      investmentPotentialScore: result.investmentPotentialScore,
      compositeScore: result.compositeScore,
      breakdown: result.components as never,
      scorerVersion: result.scorerVersion,
      scoredAt: new Date(),
    },
  });
}

export async function scoreListingById(
  listingId: string,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
) {
  const listing = await prisma.normalizedListing.findUnique({
    where: { id: listingId },
    include: { location: true, features: true, score: true },
  });
  if (!listing) throw new NotFoundError("Listing");

  const previousComposite = listing.score?.compositeScore ?? null;
  const result = scoreListing(toScoringInput(listing), config);
  const saved = await writeScore(listingId, result);

  await prisma.normalizedListing.update({
    where: { id: listingId },
    data: { processingStatus: "scored" },
  });

  // Fire alert event when composite score jumped upward.
  if (previousComposite != null && result.compositeScore > previousComposite) {
    try {
      await evaluateListingEvent({
        type: "score_increased",
        listingId,
        previousCompositeScore: previousComposite,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[alerts] score-increase evaluation failed for", listingId, err);
    }
  }

  return saved;
}

export async function recalculateAllScores(opts: {
  listingIds?: string[];
  batchSize?: number;
  config?: ScoringConfig;
} = {}) {
  const batchSize = opts.batchSize ?? 100;
  const config = opts.config ?? DEFAULT_SCORING_CONFIG;
  const where: Prisma.NormalizedListingWhereInput = opts.listingIds?.length
    ? { id: { in: opts.listingIds } }
    : {};

  let cursor: string | undefined;
  let processed = 0;

  while (true) {
    const batch = await prisma.normalizedListing.findMany({
      where,
      include: { location: true, features: true },
      take: batchSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
    });
    if (batch.length === 0) break;

    for (const listing of batch) {
      const result = scoreListing(toScoringInput(listing), config);
      await writeScore(listing.id, result);
      processed++;
    }
    cursor = batch[batch.length - 1]!.id;
    if (batch.length < batchSize) break;
  }

  return { processed, scorerVersion: config.scorerVersion };
}

// Re-export engine for callers who want to score without persisting.
export { scoreListing } from "../scoring";
export type { ScoringInput, ScoringResult, ScoringConfig } from "../scoring";
