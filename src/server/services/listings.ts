import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { BadRequestError, ConflictError, NotFoundError } from "../api/http";
import { evaluateListingEvent } from "../alerts";
import {
  paginatedResponse,
  paginationToPrisma,
  type PaginatedResponse,
} from "../api/pagination";
import type {
  ListingListQuery,
  ListingManualCreateInput,
  ListingPatchInput,
  ListingSortBy,
} from "../schemas/listings";

// ---------------------------------------------------------------------------
// Filter / sort
// ---------------------------------------------------------------------------

export function buildListingWhere(q: ListingListQuery): Prisma.NormalizedListingWhereInput {
  const where: Prisma.NormalizedListingWhereInput = {};

  if (q.country?.length) where.country = { in: q.country };
  if (q.propertyType?.length) where.propertyType = { in: q.propertyType };
  if (q.renovationStatus?.length) where.renovationStatus = { in: q.renovationStatus };
  if (q.electricityStatus?.length) where.electricityStatus = { in: q.electricityStatus };
  if (q.waterStatus?.length) where.waterStatus = { in: q.waterStatus };
  if (q.availability?.length) where.availability = { in: q.availability };
  if (q.specialObjectType?.length)
    where.specialObjectType = { in: q.specialObjectType };
  if (q.isDetached) where.isDetached = q.isDetached;
  if (q.isSpecialObject !== undefined) where.isSpecialObject = q.isSpecialObject;

  if (q.minPriceEur !== undefined || q.maxPriceEur !== undefined) {
    where.priceEur = {
      ...(q.minPriceEur !== undefined ? { gte: q.minPriceEur } : {}),
      ...(q.maxPriceEur !== undefined ? { lte: q.maxPriceEur } : {}),
    };
  }
  if (q.minLandM2 !== undefined || q.maxLandM2 !== undefined) {
    where.landAreaM2 = {
      ...(q.minLandM2 !== undefined ? { gte: q.minLandM2 } : {}),
      ...(q.maxLandM2 !== undefined ? { lte: q.maxLandM2 } : {}),
    };
  }

  // Distance lives on the related ListingLocation row. Optional 1:1 needs `is`.
  if (q.minDistanceKm !== undefined || q.maxDistanceKm !== undefined) {
    where.location = {
      is: {
        distanceFromVenloKm: {
          ...(q.minDistanceKm !== undefined ? { gte: q.minDistanceKm } : {}),
          ...(q.maxDistanceKm !== undefined ? { lte: q.maxDistanceKm } : {}),
        },
      },
    };
  }

  // Scores live on the related ListingScore row.
  if (q.minMatchScore !== undefined || q.minCompositeScore !== undefined) {
    where.score = {
      is: {
        ...(q.minMatchScore !== undefined ? { matchScore: { gte: q.minMatchScore } } : {}),
        ...(q.minCompositeScore !== undefined
          ? { compositeScore: { gte: q.minCompositeScore } }
          : {}),
      },
    };
  }

  if (q.search) {
    where.OR = [
      { titleNl: { contains: q.search, mode: "insensitive" } },
      { titleOriginal: { contains: q.search, mode: "insensitive" } },
      { city: { contains: q.search, mode: "insensitive" } },
      { addressLine: { contains: q.search, mode: "insensitive" } },
    ];
  }

  return where;
}

function buildListingOrderBy(
  sortBy: ListingSortBy,
  sortDir: "asc" | "desc",
): Prisma.NormalizedListingOrderByWithRelationInput {
  switch (sortBy) {
    case "composite_score":
      return { score: { compositeScore: sortDir } };
    case "match_score":
      return { score: { matchScore: sortDir } };
    case "price_eur":
      return { priceEur: sortDir };
    case "land_area_m2":
      return { landAreaM2: sortDir };
    case "distance_from_venlo_km":
      return { location: { distanceFromVenloKm: sortDir } };
    case "first_seen_at":
      return { firstSeenAt: sortDir };
    case "published_at":
      return { publishedAt: sortDir };
  }
}

// ---------------------------------------------------------------------------
// List / get
// ---------------------------------------------------------------------------

const LISTING_LIST_INCLUDE = {
  location: true,
  score: true,
  agency: { select: { id: true, name: true, country: true, website: true } },
  source: { select: { id: true, name: true, country: true, sourceType: true } },
  media: {
    take: 1,
    orderBy: { sortOrder: "asc" as const },
    select: { id: true, url: true, caption: true, mediaType: true },
  },
} satisfies Prisma.NormalizedListingInclude;

export async function listListings(q: ListingListQuery): Promise<
  PaginatedResponse<
    Prisma.NormalizedListingGetPayload<{ include: typeof LISTING_LIST_INCLUDE }>
  >
> {
  const where = buildListingWhere(q);
  const [data, total] = await Promise.all([
    prisma.normalizedListing.findMany({
      where,
      orderBy: buildListingOrderBy(q.sortBy, q.sortDir),
      include: LISTING_LIST_INCLUDE,
      ...paginationToPrisma(q),
    }),
    prisma.normalizedListing.count({ where }),
  ]);
  return paginatedResponse(data, total, q);
}

export async function getListing(id: string) {
  const listing = await prisma.normalizedListing.findUnique({
    where: { id },
    include: {
      location: true,
      score: true,
      agency: true,
      source: { select: { id: true, name: true, country: true, sourceType: true } },
      media: { orderBy: { sortOrder: "asc" } },
      features: true,
      rawListings: {
        select: { id: true, url: true, fetchedAt: true, processedAt: true },
        orderBy: { fetchedAt: "desc" },
        take: 20,
      },
      deduplicationGroup: { include: { members: { select: { id: true, originalUrl: true } } } },
    },
  });
  if (!listing) throw new NotFoundError("Listing");
  return listing;
}

// ---------------------------------------------------------------------------
// Manual create
// ---------------------------------------------------------------------------

function fingerprintFor(input: {
  country: string;
  postalCode?: string | null;
  addressLine?: string | null;
  priceEur?: number | null;
  landAreaM2?: number | null;
}): string {
  return createHash("sha256")
    .update(
      [
        input.country,
        input.postalCode ?? "",
        (input.addressLine ?? "").toLowerCase().trim(),
        input.priceEur ?? "",
        input.landAreaM2 ?? "",
      ].join("|"),
    )
    .digest("hex");
}

export async function manualCreateListing(input: ListingManualCreateInput) {
  const source = await prisma.source.findUnique({ where: { id: input.sourceId } });
  if (!source) throw new BadRequestError("sourceId references an unknown source");
  // Manual entries: the source must be a manual_entry source (legal hygiene).
  if (!source.collectionMethods.includes("manual_entry")) {
    throw new BadRequestError(
      "Manual listings can only be created against a source with collectionMethod 'manual_entry'.",
    );
  }
  if (input.agencyId) {
    const agency = await prisma.agency.findUnique({ where: { id: input.agencyId } });
    if (!agency) throw new BadRequestError("agencyId references an unknown agency");
  }

  // Force isSpecialObject=true if specialObjectType is set (keeps the flag honest).
  const isSpecialObject =
    input.specialObjectType !== undefined ? true : input.isSpecialObject;

  const fingerprint = fingerprintFor({
    country: input.country,
    postalCode: input.postalCode,
    addressLine: input.addressLine,
    priceEur: input.priceEur ?? null,
    landAreaM2: input.landAreaM2 ?? null,
  });

  // Reject duplicates by fingerprint. Real dedup engine (fase 5) is more
  // permissive (groups them); for manual entry we want a hard stop so a user
  // doesn't accidentally insert the same property twice.
  const existing = await prisma.normalizedListing.findUnique({ where: { fingerprint } });
  if (existing) {
    throw new ConflictError("A listing with the same fingerprint already exists", {
      existingListingId: existing.id,
    });
  }

  const created = await prisma.normalizedListing.create({
    data: {
      sourceId: input.sourceId,
      agencyId: input.agencyId,
      originalUrl: input.originalUrl,
      titleOriginal: input.titleOriginal,
      titleNl: input.titleNl,
      descriptionOriginal: input.descriptionOriginal,
      descriptionNl: input.descriptionNl,
      language: input.language,
      priceEur: input.priceEur,
      propertyType: input.propertyType,
      renovationStatus: input.renovationStatus,
      isSpecialObject,
      specialObjectType: input.specialObjectType,
      isDetached: input.isDetached,
      landAreaM2: input.landAreaM2,
      livingAreaM2: input.livingAreaM2,
      rooms: input.rooms,
      electricityStatus: input.electricityStatus,
      waterStatus: input.waterStatus,
      energyClass: input.energyClass,
      addressLine: input.addressLine,
      postalCode: input.postalCode,
      city: input.city,
      region: input.region,
      country: input.country,
      availability: "for_sale",
      processingStatus: "normalized",
      fingerprint,
      ...(input.lat !== undefined && input.lng !== undefined
        ? {
            location: {
              create: {
                lat: input.lat,
                lng: input.lng,
                accuracy: "manual",
                geocoderSource: "manual",
                geocodedAt: new Date(),
                // Manual entry with exact coords → high confidence.
                distanceType: "straight_line",
                distanceConfidence: "high",
              },
            },
          }
        : {}),
    },
    include: { location: true, score: true },
  });

  // Fire-and-forget alert evaluation. Wrapped in try/catch so a flaky
  // alerts table never sinks the create — the evaluator's failures are
  // captured in its own summary, but uncaught throws would propagate.
  try {
    await evaluateListingEvent({ type: "new_match", listingId: created.id });
    if (isSpecialObject) {
      await evaluateListingEvent({
        type: "special_object_added",
        listingId: created.id,
      });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[alerts] evaluation failed for new listing", created.id, err);
  }

  return created;
}

// ---------------------------------------------------------------------------
// Patch
// ---------------------------------------------------------------------------

export async function patchListing(id: string, input: ListingPatchInput) {
  const existing = await prisma.normalizedListing.findUnique({
    where: { id },
    include: { location: true },
  });
  if (!existing) throw new NotFoundError("Listing");

  const data: Prisma.NormalizedListingUpdateInput = {};
  for (const key of [
    "titleNl",
    "descriptionNl",
    "propertyType",
    "renovationStatus",
    "isSpecialObject",
    "specialObjectType",
    "isDetached",
    "landAreaM2",
    "livingAreaM2",
    "rooms",
    "electricityStatus",
    "waterStatus",
    "energyClass",
    "availability",
    "priceEur",
    "addressLine",
    "postalCode",
    "city",
    "region",
  ] as const) {
    if (input[key] !== undefined) {
      (data as Record<string, unknown>)[key] = input[key];
    }
  }

  // Lat/lng goes to the ListingLocation. Allow create-or-update via nested op.
  if (input.lat !== undefined || input.lng !== undefined) {
    const lat = input.lat ?? existing.location?.lat ?? null;
    const lng = input.lng ?? existing.location?.lng ?? null;
    data.location = existing.location
      ? { update: { lat, lng, geocoderSource: "manual", geocodedAt: new Date() } }
      : {
          create: {
            lat,
            lng,
            accuracy: "manual",
            geocoderSource: "manual",
            geocodedAt: new Date(),
          },
        };
  }

  const updated = await prisma.normalizedListing.update({
    where: { id },
    data,
    include: { location: true, score: true },
  });

  // Fire price-drop alerts when the price decreased.
  const oldPrice = existing.priceEur;
  const newPrice = updated.priceEur;
  if (
    input.priceEur !== undefined &&
    oldPrice != null &&
    newPrice != null &&
    newPrice < oldPrice
  ) {
    try {
      await evaluateListingEvent({
        type: "price_drop",
        listingId: id,
        previousPriceEur: oldPrice,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[alerts] price-drop evaluation failed for listing", id, err);
    }
  }

  return updated;
}

// ---------------------------------------------------------------------------
// Save / Ignore (per user)
// ---------------------------------------------------------------------------

export async function saveListing(
  userId: string,
  listingId: string,
  notes?: string | null,
) {
  const listing = await prisma.normalizedListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError("Listing");
  return prisma.savedListing.upsert({
    where: { userId_normalizedListingId: { userId, normalizedListingId: listingId } },
    create: { userId, normalizedListingId: listingId, kind: "saved", notes: notes ?? null },
    update: { kind: "saved", notes: notes ?? null },
  });
}

export async function ignoreListing(
  userId: string,
  listingId: string,
  reason?: string | null,
) {
  const listing = await prisma.normalizedListing.findUnique({ where: { id: listingId } });
  if (!listing) throw new NotFoundError("Listing");
  return prisma.savedListing.upsert({
    where: { userId_normalizedListingId: { userId, normalizedListingId: listingId } },
    create: { userId, normalizedListingId: listingId, kind: "ignored", notes: reason ?? null },
    update: { kind: "ignored", notes: reason ?? null },
  });
}
