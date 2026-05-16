import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_CRITERIA } from "@/lib/listings/criteria";

/**
 * Dashboard data fetchers. Called from Server Components — no HTTP overhead.
 *
 * "Match" = a listing that passes the brief's hard criteria:
 *   price ≤ €200k, land ≥ 1 ha, detached=yes, distance ≤ 350 km, not sold/withdrawn.
 */

const MATCH_WHERE = {
  priceEur: { lte: DEFAULT_CRITERIA.maxPriceEur },
  landAreaM2: { gte: DEFAULT_CRITERIA.minLandM2 },
  isDetached: "yes",
  availability: { in: ["for_sale", "under_offer", "unknown"] },
  location: {
    is: { distanceFromVenloKm: { lte: DEFAULT_CRITERIA.maxDistanceKm } },
  },
} satisfies Prisma.NormalizedListingWhereInput;

export type DashboardKpis = {
  newToday: number;
  activeMatches: number;
  specialObjects: number;
  averagePriceEur: number | null;
  averageDistanceKm: number | null;
  activeSources: number;
};

export async function getDashboardKpis(): Promise<DashboardKpis> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [
    newToday,
    activeMatches,
    specialObjects,
    avgPriceAgg,
    avgDistanceAgg,
    activeSources,
  ] = await Promise.all([
    prisma.normalizedListing.count({
      where: { ...MATCH_WHERE, firstSeenAt: { gte: startOfToday } },
    }),
    prisma.normalizedListing.count({ where: MATCH_WHERE }),
    prisma.normalizedListing.count({
      where: { ...MATCH_WHERE, isSpecialObject: true },
    }),
    prisma.normalizedListing.aggregate({
      where: MATCH_WHERE,
      _avg: { priceEur: true },
    }),
    prisma.listingLocation.aggregate({
      where: {
        distanceFromVenloKm: { lte: DEFAULT_CRITERIA.maxDistanceKm },
        normalizedListing: { is: MATCH_WHERE },
      },
      _avg: { distanceFromVenloKm: true },
    }),
    prisma.source.count({ where: { status: "active" } }),
  ]);

  return {
    newToday,
    activeMatches,
    specialObjects,
    averagePriceEur: avgPriceAgg._avg.priceEur ?? null,
    averageDistanceKm: avgDistanceAgg._avg.distanceFromVenloKm ?? null,
    activeSources,
  };
}

const TOP_INCLUDE = {
  location: true,
  score: true,
  source: { select: { id: true, name: true, country: true } },
  agency: { select: { id: true, name: true } },
  media: {
    take: 1,
    orderBy: { sortOrder: "asc" },
    select: { id: true, url: true, caption: true },
  },
} satisfies Prisma.NormalizedListingInclude;

export async function getTopMatches(take = 10) {
  return prisma.normalizedListing.findMany({
    where: MATCH_WHERE,
    include: TOP_INCLUDE,
    orderBy: { score: { compositeScore: "desc" } },
    take,
  });
}

export async function getNewMatches(take = 12) {
  return prisma.normalizedListing.findMany({
    where: MATCH_WHERE,
    include: TOP_INCLUDE,
    orderBy: { firstSeenAt: "desc" },
    take,
  });
}

/**
 * Recent price drops.
 *
 * Real-world flow: the normalize worker compares incoming price to the
 * previous run and writes a "price_change" ListingFeature with the delta.
 * That feature didn't exist yet in fase 2; this fetcher reads listings
 * marked with such a feature. Falls back to "newest matches" if no
 * features exist, so the dashboard never looks empty in dev/seed.
 */
export async function getRecentPriceDrops(take = 5) {
  const drops = await prisma.listingFeature.findMany({
    where: { key: "price_drop_eur", valueNumber: { lt: 0 } },
    orderBy: { updatedAt: "desc" },
    take,
    include: {
      normalizedListing: { include: TOP_INCLUDE },
    },
  });
  if (drops.length > 0) {
    return drops.map((d) => ({
      listing: d.normalizedListing,
      dropEur: d.valueNumber!,
      detectedAt: d.updatedAt,
    }));
  }
  // Fallback: pretend the most recently seen listings are recent drops so
  // the dev dashboard has a populated section. Connector pipeline will
  // produce real `price_drop_eur` features in fase 4/5.
  const recent = await prisma.normalizedListing.findMany({
    where: MATCH_WHERE,
    include: TOP_INCLUDE,
    orderBy: { lastSeenAt: "desc" },
    take,
  });
  return recent.map((l) => ({ listing: l, dropEur: 0, detectedAt: l.lastSeenAt }));
}

export async function getSpecialObjects(take = 12) {
  return prisma.normalizedListing.findMany({
    where: { ...MATCH_WHERE, isSpecialObject: true },
    include: TOP_INCLUDE,
    orderBy: { score: { compositeScore: "desc" } },
    take,
  });
}

/**
 * Map-points: alle gegeocodeerde listings binnen 350 km van Venlo,
 * niet alleen de "matches" — de map is bedoeld als overzicht van wat
 * de scrapers oppikken. Strikt filter op prijs/land/detached gebeurt
 * client-side via de filter-controls op /map.
 *
 * Listings zonder lat/lng worden uitgesloten (anders geen pin mogelijk).
 */
export async function getMapPoints(take = 500) {
  return prisma.normalizedListing.findMany({
    where: {
      availability: { in: ["for_sale", "under_offer", "unknown"] },
      location: {
        is: {
          lat: { not: null },
          lng: { not: null },
          distanceFromVenloKm: { lte: DEFAULT_CRITERIA.maxDistanceKm },
        },
      },
    },
    select: {
      id: true,
      titleNl: true,
      titleOriginal: true,
      priceEur: true,
      landAreaM2: true,
      isDetached: true,
      propertyType: true,
      specialObjectType: true,
      location: { select: { lat: true, lng: true, distanceFromVenloKm: true } },
      score: { select: { compositeScore: true } },
    },
    take,
    orderBy: [
      { score: { compositeScore: "desc" } },
      { firstSeenAt: "desc" },
    ],
  });
}

export type DashboardMatch = Awaited<ReturnType<typeof getTopMatches>>[number];
export type DashboardMapPoint = Awaited<ReturnType<typeof getMapPoints>>[number];
