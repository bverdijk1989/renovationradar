import type { ChannelHandler, DeliverableNotification, DeliveryResult } from "../types";

/**
 * In-app channel — the working production path for fase 4.
 *
 * The notification ROW in `alert_notifications` IS the in-app artifact: the
 * /notifications page reads pending+dispatched rows and renders them.
 * "Delivery" here is essentially a status transition with no side effect.
 */
export class InAppChannelHandler implements ChannelHandler {
  readonly channel = "in_app" as const;

  async deliver(_notification: DeliverableNotification): Promise<DeliveryResult> {
    return { ok: true };
  }
}
