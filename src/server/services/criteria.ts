import "server-only";
import type { Country } from "@prisma/client";
import { prisma } from "@/lib/db";
import { DEFAULT_CRITERIA } from "@/lib/listings/criteria";

/**
 * Active search criteria — singleton in DB (id="default").
 *
 * Bootstrap: bij eerste read maken we de row aan met DEFAULT_CRITERIA als
 * inhoud. Daarna is `updateCriteria()` de canonieke schrijfweg vanuit
 * de admin UI. Hardcoded DEFAULT_CRITERIA blijft als compile-time fallback
 * voor het geval de DB tijdelijk weg is — services kunnen synchroon
 * default'en voor de eerste paint.
 */

export type ActiveCriteria = {
  maxPriceEur: number;
  minLandM2: number;
  requireDetached: boolean;
  requireElectricity: boolean;
  preferWater: boolean;
  includeSpecialObjects: boolean;
  maxDistanceKm: number;
  countries: Country[];
  notes: string | null;
  updatedAt: string;
};

const SINGLETON_ID = "default";

export async function getActiveCriteria(): Promise<ActiveCriteria> {
  const row = await prisma.searchCriteria.findUnique({
    where: { id: SINGLETON_ID },
  });
  if (row) return rowToCriteria(row);

  // Bootstrap: schrijf eerste row van defaults.
  const created = await prisma.searchCriteria.upsert({
    where: { id: SINGLETON_ID },
    create: {
      id: SINGLETON_ID,
      maxPriceEur: DEFAULT_CRITERIA.maxPriceEur,
      minLandM2: DEFAULT_CRITERIA.minLandM2,
      requireDetached: DEFAULT_CRITERIA.requireDetached,
      requireElectricity: DEFAULT_CRITERIA.requireElectricity,
      preferWater: DEFAULT_CRITERIA.preferWater,
      includeSpecialObjects: true,
      maxDistanceKm: DEFAULT_CRITERIA.maxDistanceKm,
      countries: [...DEFAULT_CRITERIA.countries] as never,
    },
    update: {},
  });
  return rowToCriteria(created);
}

export async function updateCriteria(
  input: Partial<Omit<ActiveCriteria, "updatedAt">>,
  actorUserId?: string | null,
): Promise<ActiveCriteria> {
  // Existence-check + bootstrap zodat update altijd werkt.
  await getActiveCriteria();

  const row = await prisma.searchCriteria.update({
    where: { id: SINGLETON_ID },
    data: {
      ...(input.maxPriceEur !== undefined && { maxPriceEur: input.maxPriceEur }),
      ...(input.minLandM2 !== undefined && { minLandM2: input.minLandM2 }),
      ...(input.requireDetached !== undefined && {
        requireDetached: input.requireDetached,
      }),
      ...(input.requireElectricity !== undefined && {
        requireElectricity: input.requireElectricity,
      }),
      ...(input.preferWater !== undefined && {
        preferWater: input.preferWater,
      }),
      ...(input.includeSpecialObjects !== undefined && {
        includeSpecialObjects: input.includeSpecialObjects,
      }),
      ...(input.maxDistanceKm !== undefined && {
        maxDistanceKm: input.maxDistanceKm,
      }),
      ...(input.countries !== undefined && {
        countries: input.countries as never,
      }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(actorUserId !== undefined && { updatedById: actorUserId }),
    },
  });
  return rowToCriteria(row);
}

function rowToCriteria(row: {
  maxPriceEur: number;
  minLandM2: number;
  requireDetached: boolean;
  requireElectricity: boolean;
  preferWater: boolean;
  includeSpecialObjects: boolean;
  maxDistanceKm: number;
  countries: unknown;
  notes: string | null;
  updatedAt: Date;
}): ActiveCriteria {
  const countries = Array.isArray(row.countries)
    ? (row.countries.filter((c): c is Country =>
        typeof c === "string" && ["FR", "BE", "DE", "NL"].includes(c),
      ))
    : (["FR", "BE", "DE"] as Country[]);
  return {
    maxPriceEur: row.maxPriceEur,
    minLandM2: row.minLandM2,
    requireDetached: row.requireDetached,
    requireElectricity: row.requireElectricity,
    preferWater: row.preferWater,
    includeSpecialObjects: row.includeSpecialObjects,
    maxDistanceKm: row.maxDistanceKm,
    countries,
    notes: row.notes,
    updatedAt: row.updatedAt.toISOString(),
  };
}
