import "server-only";
import { prisma } from "@/lib/db";
import { Dispatcher } from "./delivery/dispatcher";
import { evaluateListingEvent } from "./evaluator";
import { runDigest } from "./digest";
import type { ListingEvent } from "./types";

/**
 * Public entry points for the Alerts Engine.
 *
 *   - evaluateListingEvent(event):
 *       Called inline whenever a listing's lifecycle produces a relevant
 *       change. Fires instant alerts immediately; queues digest entries
 *       for daily/weekly alerts.
 *
 *   - runDailyDigest() / runWeeklyDigest():
 *       Cron-driven (BullMQ scheduled job in fase 5+). Drains pending
 *       matches for the given frequency into AlertNotification rows.
 *
 *   - dispatchPending():
 *       Drains any remaining `status=pending` rows. Useful for retries
 *       after a transient channel failure.
 *
 *   - acknowledgeNotification():
 *       Marks an in-app notification as read.
 */

export { evaluateListingEvent, runDigest };

export async function runDailyDigest(now?: Date) {
  return runDigest({ frequency: "daily", now });
}
export async function runWeeklyDigest(now?: Date) {
  return runDigest({ frequency: "weekly", now });
}

export async function dispatchPending(limit?: number) {
  return new Dispatcher().dispatchPending(limit);
}

export async function acknowledgeNotification(userId: string, notificationId: string) {
  const row = await prisma.alertNotification.findUnique({
    where: { id: notificationId },
  });
  if (!row || row.userId !== userId) return null;
  return prisma.alertNotification.update({
    where: { id: notificationId },
    data: { status: "acknowledged", acknowledgedAt: new Date() },
  });
}

export async function listUserNotifications(
  userId: string,
  opts: { status?: ("pending" | "dispatched" | "acknowledged" | "failed")[]; limit?: number } = {},
) {
  return prisma.alertNotification.findMany({
    where: {
      userId,
      ...(opts.status?.length ? { status: { in: opts.status } } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: opts.limit ?? 50,
    include: {
      alert: { select: { id: true, name: true, channel: true, frequency: true } },
      listing: {
        select: {
          id: true,
          titleNl: true,
          titleOriginal: true,
          originalUrl: true,
          priceEur: true,
          country: true,
          city: true,
          isSpecialObject: true,
          specialObjectType: true,
        },
      },
    },
  });
}

export type { ListingEvent };
