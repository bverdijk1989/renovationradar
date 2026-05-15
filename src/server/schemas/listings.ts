import { z } from "zod";
import {
  CountrySchema,
  EnergyClassSchema,
  LanguageSchema,
  ListingAvailabilitySchema,
  PropertyTypeSchema,
  RenovationStatusSchema,
  SpecialObjectTypeSchema,
  TernaryFlagSchema,
  UtilityStatusSchema,
  csvArray,
} from "./common";
import { PaginationSchema } from "../api/pagination";

// --- List filters / sorting -------------------------------------------------

export const ListingSortBySchema = z.enum([
  "composite_score",
  "match_score",
  "price_eur",
  "land_area_m2",
  "distance_from_venlo_km",
  "first_seen_at",
  "published_at",
]);
export type ListingSortBy = z.infer<typeof ListingSortBySchema>;

export const ListingListQuerySchema = PaginationSchema.extend({
  country: csvArray(CountrySchema).optional(),
  propertyType: csvArray(PropertyTypeSchema).optional(),
  specialObjectType: csvArray(SpecialObjectTypeSchema).optional(),
  renovationStatus: csvArray(RenovationStatusSchema).optional(),
  electricityStatus: csvArray(UtilityStatusSchema).optional(),
  waterStatus: csvArray(UtilityStatusSchema).optional(),
  availability: csvArray(ListingAvailabilitySchema).optional(),

  minPriceEur: z.coerce.number().int().min(0).optional(),
  maxPriceEur: z.coerce.number().int().min(0).optional(),
  minLandM2: z.coerce.number().int().min(0).optional(),
  maxLandM2: z.coerce.number().int().min(0).optional(),

  minDistanceKm: z.coerce.number().min(0).optional(),
  maxDistanceKm: z.coerce.number().min(0).optional(),

  isSpecialObject: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .optional(),

  isDetached: TernaryFlagSchema.optional(),

  minMatchScore: z.coerce.number().min(0).max(100).optional(),
  minCompositeScore: z.coerce.number().min(0).max(100).optional(),

  search: z.string().min(1).max(200).optional(),

  sortBy: ListingSortBySchema.default("composite_score"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type ListingListQuery = z.infer<typeof ListingListQuerySchema>;

// --- Manual create (admin or trusted user) ---------------------------------

export const ListingManualCreateSchema = z.object({
  sourceId: z.string().uuid(),
  agencyId: z.string().uuid().optional(),
  originalUrl: z.string().url(),
  titleOriginal: z.string().min(1).max(500),
  titleNl: z.string().max(500).optional(),
  descriptionOriginal: z.string().max(20_000).optional(),
  descriptionNl: z.string().max(20_000).optional(),
  language: LanguageSchema,

  priceEur: z.number().int().min(0).max(100_000_000).optional(),

  propertyType: PropertyTypeSchema.default("unknown"),
  renovationStatus: RenovationStatusSchema.default("unknown"),
  isSpecialObject: z.boolean().default(false),
  specialObjectType: SpecialObjectTypeSchema.optional(),
  isDetached: TernaryFlagSchema.default("unknown"),

  landAreaM2: z.number().int().min(0).optional(),
  livingAreaM2: z.number().int().min(0).optional(),
  rooms: z.number().int().min(0).max(100).optional(),

  electricityStatus: UtilityStatusSchema.default("unknown"),
  waterStatus: UtilityStatusSchema.default("unknown"),
  energyClass: EnergyClassSchema.default("unknown"),

  addressLine: z.string().max(500).optional(),
  postalCode: z.string().max(20).optional(),
  city: z.string().max(200).optional(),
  region: z.string().max(200).optional(),
  country: CountrySchema,

  lat: z.number().gte(-90).lte(90).optional(),
  lng: z.number().gte(-180).lte(180).optional(),
});
export type ListingManualCreateInput = z.infer<typeof ListingManualCreateSchema>;

// --- Patch (admin can edit anything user-curated) --------------------------

export const ListingPatchSchema = z
  .object({
    titleNl: z.string().max(500).nullable(),
    descriptionNl: z.string().max(20_000).nullable(),
    propertyType: PropertyTypeSchema,
    renovationStatus: RenovationStatusSchema,
    isSpecialObject: z.boolean(),
    specialObjectType: SpecialObjectTypeSchema.nullable(),
    isDetached: TernaryFlagSchema,
    landAreaM2: z.number().int().min(0).nullable(),
    livingAreaM2: z.number().int().min(0).nullable(),
    rooms: z.number().int().min(0).max(100).nullable(),
    electricityStatus: UtilityStatusSchema,
    waterStatus: UtilityStatusSchema,
    energyClass: EnergyClassSchema,
    availability: ListingAvailabilitySchema,
    priceEur: z.number().int().min(0).max(100_000_000).nullable(),
    addressLine: z.string().max(500).nullable(),
    postalCode: z.string().max(20).nullable(),
    city: z.string().max(200).nullable(),
    region: z.string().max(200).nullable(),
    lat: z.number().gte(-90).lte(90).nullable(),
    lng: z.number().gte(-180).lte(180).nullable(),
  })
  .partial();
export type ListingPatchInput = z.infer<typeof ListingPatchSchema>;

// --- Save / Ignore ----------------------------------------------------------

export const ListingSaveSchema = z.object({
  notes: z.string().max(5_000).optional(),
});
export const ListingIgnoreSchema = z.object({
  reason: z.string().max(500).optional(),
});
