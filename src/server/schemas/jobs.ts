import { z } from "zod";
import { CrawlJobStatusSchema, csvArray } from "./common";
import { PaginationSchema } from "../api/pagination";

export const JobListQuerySchema = PaginationSchema.extend({
  sourceId: z.string().uuid().optional(),
  status: csvArray(CrawlJobStatusSchema).optional(),
});

export const RunSearchJobSchema = z.object({
  sourceId: z.string().uuid(),
  searchProfileId: z.string().uuid().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type RunSearchJobInput = z.infer<typeof RunSearchJobSchema>;

export const ScoringRecalculateSchema = z.object({
  // Optional: limit recalculation scope. If omitted, all listings are rescored.
  listingIds: z.array(z.string().uuid()).max(10_000).optional(),
  scorerVersion: z.string().max(50).optional(),
});
export type ScoringRecalculateInput = z.infer<typeof ScoringRecalculateSchema>;
