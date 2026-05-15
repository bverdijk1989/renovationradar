import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { match, type ListingForMatching } from "./matcher";
import { Dispatcher } from "./delivery/dispatcher";
import type { EvaluationSummary, ListingEvent } from "./types";

/**
 * Realtime evaluation: a single listing event was produced (new listing,
 * price changed, score changed). We:
 *
 *   1. Load the listing + location + score.
 *   2. Query ALL enabled alerts (filter narrowing happens in matcher.match —
 *      pulling all is fine because alert volume is low per user and matcher
 *      is pure-function fast).
 *   3. For each alert: run matcher.match.
 *   4. On match: try to `create()` an AlertNotification. Unique constraint
 *      on (alertId, listingId, eventType) means a duplicate INSERT returns
 *      P2002 → counted as `skippedDuplicates`, NOT an error.
 *   5. For `frequency=instant` alerts → immediately dispatch the new row.
 *      For `frequency=daily|weekly` → leave pending; the digest job picks
 *      them up.
 *
 * Returns a summary so callers (admin endpoint, BullMQ worker) can log it.
 */
export async function evaluateListingEvent(
  event: ListingEvent,
  opts: { dispatcher?: Dispatcher } = {},
): Promise<EvaluationSummary> {
  const listing = await prisma.normalizedListing.findUnique({
    where: { id: event.listingId },
    include: { location: true, score: true },
  });
  const summary: EvaluationSummary = {
    listingId: event.listingId,
    evaluatedAlerts: 0,
    matched: 0,
    created: 0,
    skippedDuplicates: 0,
    dispatched: 0,
    failed: 0,
  };
  if (!listing) return summary;

  const alerts = await prisma.alert.findMany({ where: { enabled: true } });
  summary.evaluatedAlerts = alerts.length;
  if (alerts.length === 0) return summary;

  const dispatcher = opts.dispatcher ?? new Dispatcher();

  for (const alert of alerts) {
    const result = match(alert, listing as ListingForMatching, event);
    if (!result.matches) continue;
    summary.matched += 1;

    // Create the row. Unique constraint dedups.
    let createdId: string | null = null;
    try {
      const row = await prisma.alertNotification.create({
        data: {
          alertId: alert.id,
          normalizedListingId: listing.id,
          userId: alert.userId,
          eventType: result.eventType,
          channel: alert.channel,
          status: "pending",
          payload: result.payload as never,
        },
      });
      createdId = row.id;
      summary.created += 1;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        summary.skippedDuplicates += 1;
        continue;
      }
      throw err;
    }

    // Instant-frequency alerts dispatch right away.
    if (alert.frequency === "instant" && createdId) {
      const dispatched = await dispatcher.dispatch({
        id: createdId,
        alertId: alert.id,
        alertName: alert.name,
        userId: alert.userId,
        channel: alert.channel,
        eventType: result.eventType,
        payload: result.payload,
        listing: {
          id: listing.id,
          titleNl: listing.titleNl,
          titleOriginal: listing.titleOriginal,
          originalUrl: listing.originalUrl,
          priceEur: listing.priceEur,
          country: listing.country,
          city: listing.city,
        },
      });
      if (dispatched.ok) summary.dispatched += 1;
      else summary.failed += 1;
    }
  }

  return summary;
}
