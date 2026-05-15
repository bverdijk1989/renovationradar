import type { ChannelHandler, DeliverableNotification, DeliveryResult } from "../types";

/**
 * Email channel — placeholder.
 *
 * Real implementation in fase 5+: wire to Resend / Postmark / SES.
 * Recommended composition:
 *   1. Format the listing into a small HTML + plain-text template
 *      (title, price, ha, distance, photo, "Open" link).
 *   2. Add a List-Unsubscribe header pointing to a per-user opt-out.
 *   3. Rate-limit per-user to avoid notification spam (1 email per 10 min
 *      with batching of pending rows).
 *
 * Until then this handler returns `ok: false` with a "channel not
 * configured" reason. The dispatcher marks the row `status=failed` with
 * the same message so the user knows nothing was sent.
 */
export class EmailChannelHandler implements ChannelHandler {
  readonly channel = "email" as const;

  async deliver(_notification: DeliverableNotification): Promise<DeliveryResult> {
    return {
      ok: false,
      reason:
        "E-mail kanaal is een placeholder. Configureer een e-mail provider (Resend/Postmark/SES) in fase 5+.",
    };
  }
}
