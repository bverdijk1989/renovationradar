/**
 * Idempotent seed for Renovation Radar EU.
 *
 * Run via `pnpm db:seed` (or as part of `pnpm db:setup`).
 *
 * Strategy:
 *   - Every seeded row gets a DETERMINISTIC UUID derived from a stable
 *     `seedKey`. Re-running the seed therefore upserts by id, not by
 *     scanning unique constraints, which keeps the script straightforward
 *     even though NormalizedListing has no natural unique key.
 *   - Human-curated columns (Source.status, robotsStatus, termsStatus,
 *     legalStatus) are NOT overwritten on re-seed - what an admin sets in
 *     the registry UI must persist.
 *   - Listings, scores, locations, media and features ARE rewritten on
 *     re-seed (they are dev/test data, no human edits expected).
 */

import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { searchProfileSeeds } from "./data/search-profiles";
import { sourceSeeds } from "./data/sources";
import { agencySeeds, listingSeeds } from "./data/listings";
import { composeScore } from "../src/lib/scoring/types";

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deterministic UUID-v5-style id from a stable seed key. Same key → same id
 * across runs, so seed inserts are safe upserts via { where: { id } }.
 */
function seedUuid(seedKey: string): string {
  const hash = createHash("sha1")
    .update(`renovation-radar::${seedKey}`)
    .digest();
  const bytes = Buffer.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x50; // version 5
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(
    16,
    20,
  )}-${hex.slice(20, 32)}`;
}

/** sha256 hash, hex-encoded. */
function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Dedup fingerprint used by the Deduplication Engine and seed-side uniqueness. */
function fingerprintFor(input: {
  country: string;
  postalCode?: string | null;
  addressLine?: string | null;
  priceEur?: number | null;
  landAreaM2?: number | null;
}): string {
  return sha256(
    [
      input.country,
      input.postalCode ?? "",
      (input.addressLine ?? "").toLowerCase().trim(),
      input.priceEur ?? "",
      input.landAreaM2 ?? "",
    ].join("|"),
  );
}

// ---------------------------------------------------------------------------
// Seed steps
// ---------------------------------------------------------------------------

async function seedSearchProfiles() {
  for (const profile of searchProfileSeeds) {
    const id = seedUuid(`search_profile::${profile.name}`);
    await prisma.searchProfile.upsert({
      where: { id },
      create: {
        id,
        name: profile.name,
        country: profile.country,
        language: profile.language,
        category: profile.category,
        terms: profile.terms,
        active: true,
      },
      update: {
        name: profile.name,
        country: profile.country,
        language: profile.language,
        category: profile.category,
        terms: profile.terms,
      },
    });
  }
  console.log(`[seed] search profiles: ${searchProfileSeeds.length}`);
}

async function seedSources(): Promise<Map<string, string>> {
  const idBySeedKey = new Map<string, string>();
  for (const s of sourceSeeds) {
    const id = seedUuid(`source::${s.seedKey}`);
    idBySeedKey.set(s.seedKey, id);
    await prisma.source.upsert({
      where: { id },
      create: {
        id,
        name: s.name,
        country: s.country,
        website: s.website,
        sourceType: s.sourceType,
        collectionMethods: s.collectionMethods,
        status: s.status,
        robotsStatus: s.robotsStatus,
        termsStatus: s.termsStatus,
        legalStatus: s.legalStatus,
        notes: s.notes,
        rateLimitPerMinute: s.rateLimitPerMinute,
      },
      update: {
        // Re-seed is allowed to refresh static fields, but MUST NOT overwrite
        // human-curated columns (status, robots/terms/legal). Those are the
        // admin's call in the Source Registry UI.
        name: s.name,
        website: s.website,
        sourceType: s.sourceType,
        collectionMethods: s.collectionMethods,
        notes: s.notes,
        rateLimitPerMinute: s.rateLimitPerMinute,
      },
    });
  }
  console.log(`[seed] sources: ${sourceSeeds.length}`);
  return idBySeedKey;
}

async function seedAgencies(): Promise<Map<string, string>> {
  const idBySeedKey = new Map<string, string>();
  for (const a of agencySeeds) {
    const id = seedUuid(`agency::${a.seedKey}`);
    idBySeedKey.set(a.seedKey, id);
    await prisma.agency.upsert({
      where: { id },
      create: {
        id,
        name: a.name,
        country: a.country,
        website: a.website,
        email: a.email,
      },
      update: {
        name: a.name,
        website: a.website,
        email: a.email,
      },
    });
  }
  console.log(`[seed] agencies: ${agencySeeds.length}`);
  return idBySeedKey;
}

async function seedListings(
  sourceIdBySeedKey: Map<string, string>,
  agencyIdBySeedKey: Map<string, string>,
) {
  for (const l of listingSeeds) {
    const listingId = seedUuid(`listing::${l.seedKey}`);
    const sourceId = sourceIdBySeedKey.get(l.sourceKey);
    if (!sourceId) {
      throw new Error(
        `[seed] listing '${l.seedKey}' references unknown source '${l.sourceKey}'`,
      );
    }
    const agencyId = l.agencyKey
      ? agencyIdBySeedKey.get(l.agencyKey)
      : undefined;
    if (l.agencyKey && !agencyId) {
      throw new Error(
        `[seed] listing '${l.seedKey}' references unknown agency '${l.agencyKey}'`,
      );
    }

    const publishedAt = l.publishedAtDaysAgo
      ? new Date(Date.now() - l.publishedAtDaysAgo * 24 * 60 * 60 * 1000)
      : null;

    const fingerprint = fingerprintFor({
      country: l.country,
      postalCode: l.postalCode,
      addressLine: l.addressLine,
      priceEur: l.priceEur,
      landAreaM2: l.landAreaM2,
    });

    // --- NormalizedListing ------------------------------------------------
    await prisma.normalizedListing.upsert({
      where: { id: listingId },
      create: {
        id: listingId,
        sourceId,
        agencyId,
        originalUrl: `internal://seed/${l.seedKey}`,
        titleOriginal: l.titleOriginal,
        titleNl: l.titleNl,
        descriptionOriginal: l.descriptionOriginal,
        descriptionNl: l.descriptionNl,
        language: l.language,
        priceEur: l.priceEur,
        priceCurrency: "EUR",
        propertyType: l.propertyType,
        renovationStatus: l.renovationStatus,
        isSpecialObject: l.isSpecialObject,
        specialObjectType: l.specialObjectType,
        isDetached: l.isDetached,
        landAreaM2: l.landAreaM2,
        livingAreaM2: l.livingAreaM2,
        rooms: l.rooms,
        electricityStatus: l.electricityStatus,
        waterStatus: l.waterStatus,
        addressLine: l.addressLine,
        postalCode: l.postalCode,
        city: l.city,
        region: l.region,
        country: l.country,
        availability: l.availability ?? "for_sale",
        processingStatus: "scored",
        fingerprint,
        publishedAt,
      },
      update: {
        titleOriginal: l.titleOriginal,
        titleNl: l.titleNl,
        descriptionOriginal: l.descriptionOriginal,
        descriptionNl: l.descriptionNl,
        language: l.language,
        priceEur: l.priceEur,
        propertyType: l.propertyType,
        renovationStatus: l.renovationStatus,
        isSpecialObject: l.isSpecialObject,
        specialObjectType: l.specialObjectType,
        isDetached: l.isDetached,
        landAreaM2: l.landAreaM2,
        livingAreaM2: l.livingAreaM2,
        rooms: l.rooms,
        electricityStatus: l.electricityStatus,
        waterStatus: l.waterStatus,
        addressLine: l.addressLine,
        postalCode: l.postalCode,
        city: l.city,
        region: l.region,
        country: l.country,
        availability: l.availability ?? "for_sale",
        fingerprint,
        publishedAt,
      },
    });

    // --- ListingLocation (trigger fills geography + distance) --------------
    // Seed coordinates are real city centers, so confidence is high(ish);
    // we pick "medium" because exact addressLine isn't always set in seed.
    const seedConfidence =
      l.addressLine && l.postalCode ? "high" : l.postalCode || l.city ? "medium" : "low";
    await prisma.listingLocation.upsert({
      where: { normalizedListingId: listingId },
      create: {
        id: seedUuid(`location::${l.seedKey}`),
        normalizedListingId: listingId,
        lat: l.lat,
        lng: l.lng,
        accuracy: "city",
        geocoderSource: "manual",
        geocodedAt: new Date(),
        distanceType: "straight_line",
        distanceConfidence: seedConfidence,
      },
      update: {
        lat: l.lat,
        lng: l.lng,
        accuracy: "city",
        geocoderSource: "manual",
        geocodedAt: new Date(),
        distanceType: "straight_line",
        distanceConfidence: seedConfidence,
      },
    });

    // --- ListingScore -----------------------------------------------------
    const composite =
      l.score.compositeScore ??
      composeScore({
        matchScore: l.score.matchScore,
        renovationScore: l.score.renovationScore,
        specialObjectScore: l.score.specialObjectScore,
        dataConfidence: l.score.dataConfidence,
        investmentPotentialScore: l.score.investmentPotentialScore,
      });

    await prisma.listingScore.upsert({
      where: { normalizedListingId: listingId },
      create: {
        normalizedListingId: listingId,
        matchScore: l.score.matchScore,
        renovationScore: l.score.renovationScore,
        specialObjectScore: l.score.specialObjectScore,
        dataConfidence: l.score.dataConfidence,
        investmentPotentialScore: l.score.investmentPotentialScore,
        compositeScore: composite,
        scorerVersion: "seed-v1",
      },
      update: {
        matchScore: l.score.matchScore,
        renovationScore: l.score.renovationScore,
        specialObjectScore: l.score.specialObjectScore,
        dataConfidence: l.score.dataConfidence,
        investmentPotentialScore: l.score.investmentPotentialScore,
        compositeScore: composite,
        scoredAt: new Date(),
      },
    });

    // --- ListingMedia (replace on re-seed) --------------------------------
    await prisma.listingMedia.deleteMany({ where: { normalizedListingId: listingId } });
    for (const [i, m] of l.media.entries()) {
      await prisma.listingMedia.create({
        data: {
          id: seedUuid(`media::${l.seedKey}::${i}`),
          normalizedListingId: listingId,
          mediaType: "image",
          url: m.url,
          caption: m.caption,
          sortOrder: i,
        },
      });
    }

    // --- ListingFeature (replace on re-seed) -------------------------------
    await prisma.listingFeature.deleteMany({ where: { normalizedListingId: listingId } });
    for (const f of l.features) {
      await prisma.listingFeature.create({
        data: {
          id: seedUuid(`feature::${l.seedKey}::${f.key}`),
          normalizedListingId: listingId,
          key: f.key,
          valueString: f.valueString,
          valueNumber: f.valueNumber,
          valueBool: f.valueBool,
          confidence: f.confidence ?? 1.0,
          source: "manual",
        },
      });
    }

  }

  console.log(`[seed] listings: ${listingSeeds.length}`);
}

async function seedDevAdmin() {
  const email = process.env.SEED_DEV_ADMIN_EMAIL;
  if (!email) return;
  const id = seedUuid(`user::dev_admin::${email}`);
  await prisma.user.upsert({
    where: { id },
    create: { id, email, role: "admin", name: "Dev Admin" },
    update: { role: "admin" },
  });
  console.log(`[seed] dev admin ensured: ${email}`);
}

async function main() {
  await seedSearchProfiles();
  const sourceIdBySeedKey = await seedSources();
  const agencyIdBySeedKey = await seedAgencies();
  await seedListings(sourceIdBySeedKey, agencyIdBySeedKey);
  await seedDevAdmin();
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
