import { z } from "zod";
import {
  CollectionMethodSchema,
  CountrySchema,
  LegalStatusSchema,
  RobotsStatusSchema,
  SourceStatusSchema,
  SourceTypeSchema,
  TermsStatusSchema,
  csvArray,
} from "./common";
import { PaginationSchema } from "../api/pagination";

// --- List filters / sorting -------------------------------------------------

export const SourceListQuerySchema = PaginationSchema.extend({
  country: csvArray(CountrySchema).optional(),
  status: csvArray(SourceStatusSchema).optional(),
  legalStatus: csvArray(LegalStatusSchema).optional(),
  sourceType: csvArray(SourceTypeSchema).optional(),
  search: z.string().min(1).optional(),
  sortBy: z
    .enum(["createdAt", "updatedAt", "name", "lastCheckedAt"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});
export type SourceListQuery = z.infer<typeof SourceListQuerySchema>;

// --- Create -----------------------------------------------------------------

export const SourceCreateSchema = z.object({
  name: z.string().min(1).max(200),
  country: CountrySchema,
  website: z.string().url(),
  sourceType: SourceTypeSchema,
  collectionMethods: z.array(CollectionMethodSchema).min(1),
  notes: z.string().max(5_000).optional(),
  connectorConfig: z.record(z.string(), z.unknown()).optional(),
  rateLimitPerMinute: z.number().int().min(1).max(600).optional(),
  userAgent: z.string().max(200).optional(),
});
export type SourceCreateInput = z.infer<typeof SourceCreateSchema>;

// --- Patch (admin can update everything; non-admin only notes) -------------

export const SourcePatchSchema = z
  .object({
    name: z.string().min(1).max(200),
    website: z.string().url(),
    sourceType: SourceTypeSchema,
    collectionMethods: z.array(CollectionMethodSchema).min(1),
    notes: z.string().max(5_000).nullable(),
    connectorConfig: z.record(z.string(), z.unknown()).nullable(),
    rateLimitPerMinute: z.number().int().min(1).max(600).nullable(),
    userAgent: z.string().max(200).nullable(),
    robotsStatus: RobotsStatusSchema,
    termsStatus: TermsStatusSchema,
    legalStatus: LegalStatusSchema,
    status: SourceStatusSchema,
  })
  .partial();
export type SourcePatchInput = z.infer<typeof SourcePatchSchema>;

// --- Check (re-evaluate ToS/robots and write a SourceReview) ---------------

export const SourceCheckSchema = z.object({
  robotsStatus: RobotsStatusSchema,
  termsStatus: TermsStatusSchema,
  legalStatus: LegalStatusSchema,
  evidenceUrl: z.string().url().optional(),
  notes: z.string().max(5_000).optional(),
});
export type SourceCheckInput = z.infer<typeof SourceCheckSchema>;
