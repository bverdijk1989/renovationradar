import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { match, type ListingForMatching } from "./matcher";
import { Dispatcher } from "./delivery/dispatcher";
import type { DigestSummary, ListingEvent } from "./types";

/**
 * Daily / weekly digest builder.
 *
 * For each alert whose frequency is `daily` (or `weekly`):
 *   1. Determine the lookback window. Default: since `alert.lastRunAt`
 *      or 24h for daily / 7d for weekly when no previous run exists.
 *   2. Fetch listings whose `firstSeenAt >= since` (plus a UNION of
 *      `lastSeenAt >= since` for price-drop alerts — handled via separate
 *      query).
 *   3. Run the matcher with event=`new_match` (digest defaults to that
 *      event type; price/score digests are best handled inline).
 *   4. Skip already-notified (alert+listing+event) via unique constraint
 *      → P2002 caught silently.
 *   5. Dispatch every newly-created notification.
 *   6. Update `alert.lastRunAt` so the next run picks up only newer rows.
 *
 * Returns counters per run so the cron output is observable.
 */
export async function runDigest(
  opts: {
    frequency?: "daily" | "weekly";
    alertId?: string;
    now?: Date;
    dispatcher?: Dispatcher;
  } = {},
): Promise<DigestSummary> {
  const frequency = opts.frequency ?? "daily";
  const now = opts.now ?? new Date();
  const dispatcher = opts.dispatcher ?? new Dispatcher();

  const alerts = await prisma.alert.findMany({
    where: {
      enabled: true,
      frequency,
      ...(opts.alertId ? { id: opts.alertId } : {}),
    },
  });

  const summary: DigestSummary = {
    alertsProcessed: alerts.length,
    notificationsCreated: 0,
    notificationsDispatched: 0,
    notificationsFailed: 0,
  };
  if (alerts.length === 0) return summary;

  const defaultLookbackMs =
    frequency === "weekly" ? 7 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

  for (const alert of alerts) {
    const since = alert.lastRunAt ?? new Date(now.getTime() - defaultLookbackMs);

    // Pull candidate listings: anything seen since the lookback. The matcher
    // filters down to the actual criteria match.
    const listings = await prisma.normalizedListing.findMany({
      where: {
        OR: [{ firstSeenAt: { gte: since } }, { lastSeenAt: { gte: since } }],
        availability: { not: "sold" },
      },
      include: { location: true, score: true },
      take: 500, // safety cap per digest run
      orderBy: { firstSeenAt: "desc" },
    });

    for (const listing of listings) {
      const event: ListingEvent = { type: "new_match", listingId: listing.id };
      const result = match(alert, listing as ListingForMatching, event);
      if (!result.matches) continue;

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
        summary.notificationsCreated += 1;
      } catch (err) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002"
        ) {
          continue;
        }
        throw err;
      }

      if (createdId) {
        const out = await dispatcher.dispatch({
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
        if (out.ok) summary.notificationsDispatched += 1;
        else summary.notificationsFailed += 1;
      }
    }

    await prisma.alert.update({
      where: { id: alert.id },
      data: { lastRunAt: now },
    });
  }

  return summary;
}
