/**
 * Hard search criteria from the project brief. These defaults are what
 * separates "interesting" listings from noise. Override per query as needed
 * (e.g. in alerts the user can broaden price or relax detachment).
 */
import { z } from "zod";
import { MAX_RADIUS_KM_DEFAULT } from "@/lib/geo";

export const DEFAULT_CRITERIA = Object.freeze({
  maxPriceEur: 200_000,
  minLandM2: 10_000, // 1 hectare
  countries: ["FR", "BE", "DE"] as const,
  maxDistanceKm: MAX_RADIUS_KM_DEFAULT,
  requireDetached: true,
  /** electricity must be present OR likely */
  requireElectricity: true,
  /** water present preferred but not mandatory */
  preferWater: true,
});

export const CountrySchema = z.enum(["FR", "BE", "DE", "NL"]);

export const ListingCriteriaSchema = z.object({
  maxPriceEur: z.number().int().positive().default(DEFAULT_CRITERIA.maxPriceEur),
  minPriceEur: z.number().int().min(0).optional(),
  minLandM2: z.number().int().positive().default(DEFAULT_CRITERIA.minLandM2),
  countries: z.array(CountrySchema).min(1).default([...DEFAULT_CRITERIA.countries]),
  maxDistanceKm: z.number().positive().default(DEFAULT_CRITERIA.maxDistanceKm),
  requireDetached: z.boolean().default(DEFAULT_CRITERIA.requireDetached),
  requireElectricity: z.boolean().default(DEFAULT_CRITERIA.requireElectricity),
  specialObjectsOnly: z.boolean().default(false),
  keywords: z.array(z.string().min(1)).optional(),
});

export type ListingCriteria = z.infer<typeof ListingCriteriaSchema>;
