import { z } from "zod";
import { AlertChannelSchema, AlertFrequencySchema } from "./common";
import { ListingListQuerySchema } from "./listings";
import { PaginationSchema } from "../api/pagination";

/** Event types the alerts engine can fire on. */
export const NotificationEventTypeSchema = z.enum([
  "new_match",
  "price_drop",
  "score_increased",
  "special_object_added",
]);
export type NotificationEventType = z.infer<typeof NotificationEventTypeSchema>;

/**
 * Alert criteria. Reuses the listing filter schema (minus pagination +
 * sorting) so a saved alert is "the filter the user would have applied",
 * AND extends with event-type subscriptions and event-specific thresholds:
 *
 *   - `eventTypes`: which event(s) trigger this alert. Defaults to
 *     ['new_match'] (the most common case).
 *   - `minPriceDropPercent`: ignore price drops smaller than X% of the
 *     previous price (avoids false alarms on €1 corrections).
 *   - `minPriceDropEur`: same idea, absolute threshold.
 *   - `minScoreIncrease`: only fire 'score_increased' when the composite
 *     jumped by at least N points.
 */
export const AlertCriteriaSchema = ListingListQuerySchema.omit({
  page: true,
  pageSize: true,
  sortBy: true,
  sortDir: true,
})
  .extend({
    eventTypes: z
      .array(NotificationEventTypeSchema)
      .min(1)
      .default(["new_match"]),
    minPriceDropPercent: z.number().min(0).max(100).optional(),
    minPriceDropEur: z.number().int().min(0).optional(),
    minScoreIncrease: z.number().min(0).max(100).optional(),
  });
export type AlertCriteria = z.infer<typeof AlertCriteriaSchema>;

export const AlertListQuerySchema = PaginationSchema.extend({
  enabled: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .transform((v) => (typeof v === "boolean" ? v : v === "true"))
    .optional(),
});

export const AlertCreateSchema = z.object({
  name: z.string().min(1).max(200),
  enabled: z.boolean().default(true),
  channel: AlertChannelSchema.default("email"),
  frequency: AlertFrequencySchema.default("daily"),
  criteria: AlertCriteriaSchema,
});
export type AlertCreateInput = z.infer<typeof AlertCreateSchema>;

export const AlertPatchSchema = z
  .object({
    name: z.string().min(1).max(200),
    enabled: z.boolean(),
    channel: AlertChannelSchema,
    frequency: AlertFrequencySchema,
    criteria: AlertCriteriaSchema,
  })
  .partial();
export type AlertPatchInput = z.infer<typeof AlertPatchSchema>;
