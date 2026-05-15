import "server-only";
import type { AlertChannel } from "@prisma/client";
import { prisma } from "@/lib/db";
import { InAppChannelHandler } from "./in-app";
import { EmailChannelHandler } from "./email";
import { WebhookChannelHandler } from "./webhook";
import type { ChannelHandler, DeliverableNotification } from "../types";

/**
 * Channel router + persister. Knows about every channel handler; picks
 * the right one for each notification and writes the result back to the
 * AlertNotification row.
 *
 *   - in_app → instant success (the row's existence is the artifact)
 *   - email → placeholder, row marked `failed` with reason
 *   - webhook → placeholder, same
 *   - web_push → not bundled here; not in scope for fase 4
 *
 * The dispatcher is the ONLY component that mutates AlertNotification
 * status / dispatchedAt / failureReason. Keeping it in one place means
 * the schema change for new channels (real email/webhook later) is a
 * one-handler swap.
 */
export class Dispatcher {
  private readonly handlers: Map<AlertChannel, ChannelHandler>;

  constructor(handlers?: ChannelHandler[]) {
    const defaults: ChannelHandler[] = handlers ?? [
      new InAppChannelHandler(),
      new EmailChannelHandler(),
      new WebhookChannelHandler(),
    ];
    this.handlers = new Map(defaults.map((h) => [h.channel, h]));
  }

  /**
   * Pick the right handler and run it. Always returns; failure paths
   * write `status=failed` rather than throwing so a flaky channel never
   * sinks an entire batch.
   */
  async dispatch(n: DeliverableNotification): Promise<{ ok: boolean; reason?: string }> {
    const handler = this.handlers.get(n.channel);
    if (!handler) {
      await this.mark(n.id, "failed", `geen handler voor kanaal '${n.channel}'`);
      return { ok: false, reason: "no_handler" };
    }
    let result;
    try {
      result = await handler.deliver(n);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await this.mark(n.id, "failed", `handler-fout: ${msg}`);
      return { ok: false, reason: msg };
    }
    if (result.ok) {
      await this.mark(n.id, "dispatched");
      return { ok: true };
    }
    await this.mark(n.id, "failed", result.reason);
    return { ok: false, reason: result.reason };
  }

  /** Drain all pending notifications. Used by both realtime and digest. */
  async dispatchPending(limit = 200): Promise<{
    total: number;
    dispatched: number;
    failed: number;
  }> {
    const rows = await prisma.alertNotification.findMany({
      where: { status: "pending" },
      orderBy: { createdAt: "asc" },
      take: limit,
      include: {
        alert: { select: { name: true } },
        listing: {
          select: {
            id: true,
            titleNl: true,
            titleOriginal: true,
            originalUrl: true,
            priceEur: true,
            country: true,
            city: true,
          },
        },
      },
    });

    let dispatched = 0;
    let failed = 0;
    for (const row of rows) {
      const out = await this.dispatch({
        id: row.id,
        alertId: row.alertId,
        alertName: row.alert.name,
        userId: row.userId,
        channel: row.channel,
        eventType: row.eventType,
        payload: row.payload as Record<string, unknown>,
        listing: row.listing,
      });
      if (out.ok) dispatched++;
      else failed++;
    }
    return { total: rows.length, dispatched, failed };
  }

  private async mark(
    id: string,
    status: "dispatched" | "failed",
    failureReason?: string,
  ): Promise<void> {
    await prisma.alertNotification.update({
      where: { id },
      data: {
        status,
        dispatchedAt: new Date(),
        failureReason: status === "failed" ? failureReason ?? null : null,
      },
    });
  }
}
