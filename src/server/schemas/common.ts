import { z } from "zod";

export const UuidSchema = z.string().uuid();

export const CountrySchema = z.enum(["FR", "BE", "DE", "NL"]);
export const LanguageSchema = z.enum(["fr", "nl", "de", "en"]);

export const PropertyTypeSchema = z.enum([
  "detached_house",
  "farmhouse",
  "longere",
  "manor",
  "mansion",
  "barn",
  "ruin",
  "mill",
  "watermill",
  "station_building",
  "lock_keeper_house",
  "level_crossing_house",
  "lighthouse",
  "chapel",
  "monastery",
  "other",
  "unknown",
]);

export const SpecialObjectTypeSchema = z.enum([
  "mill",
  "watermill",
  "station_building",
  "lock_keeper_house",
  "level_crossing_house",
  "lighthouse",
  "chapel",
  "monastery",
  "other",
]);

export const RenovationStatusSchema = z.enum([
  "ruin",
  "needs_renovation",
  "partial_renovation",
  "move_in_ready",
  "unknown",
]);

export const TernaryFlagSchema = z.enum(["yes", "no", "unknown"]);
export const UtilityStatusSchema = z.enum([
  "present",
  "likely",
  "absent",
  "unknown",
]);
export const EnergyClassSchema = z.enum([
  "A_PLUS",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "unknown",
]);
export const ListingAvailabilitySchema = z.enum([
  "for_sale",
  "under_offer",
  "sold",
  "withdrawn",
  "unknown",
]);

export const SourceTypeSchema = z.enum([
  "api",
  "rss",
  "sitemap",
  "manual",
  "email",
  "scrape",
]);
export const CollectionMethodSchema = z.enum([
  "api",
  "rss",
  "sitemap",
  "manual_entry",
  "email_inbox",
  "scrape_with_permission",
]);
export const SourceStatusSchema = z.enum([
  "active",
  "paused",
  "blocked",
  "retired",
  "pending_review",
]);
export const RobotsStatusSchema = z.enum([
  "allows",
  "disallows",
  "partial",
  "not_applicable",
  "unknown",
]);
export const TermsStatusSchema = z.enum([
  "allows",
  "prohibits",
  "unclear",
  "custom_agreement",
  "not_applicable",
  "unknown",
]);
export const LegalStatusSchema = z.enum([
  "green",
  "amber",
  "red",
  "pending_review",
]);
export const CrawlJobStatusSchema = z.enum([
  "queued",
  "running",
  "succeeded",
  "failed",
  "partial",
  "cancelled",
]);
export const AlertChannelSchema = z.enum(["email", "web_push", "in_app"]);
export const AlertFrequencySchema = z.enum(["instant", "daily", "weekly"]);

/**
 * Accepts a comma-separated string OR an array and returns an array.
 * Useful for query params like ?country=FR,BE → ["FR","BE"].
 */
export function csvArray<S extends z.ZodTypeAny>(itemSchema: S) {
  return z
    .union([z.string(), z.array(itemSchema), z.array(z.string())])
    .transform((val) => {
      if (Array.isArray(val)) return val;
      return val
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    })
    .pipe(z.array(itemSchema));
}
