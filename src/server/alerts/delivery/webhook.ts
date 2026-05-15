import type { ChannelHandler, DeliverableNotification, DeliveryResult } from "../types";

/**
 * Webhook channel — placeholder.
 *
 * Real implementation in fase 5+: POST a JSON envelope to a user-configured
 * URL stored on the Alert row (e.g. `criteria.webhookUrl` or a separate
 * `Alert.webhookUrl` field). Sign with HMAC for verification, retry with
 * exponential backoff on 5xx, dead-letter after N failures.
 *
 * Until then this handler returns `ok: false`. The dispatcher records the
 * reason on AlertNotification.failureReason.
 */
export class WebhookChannelHandler implements ChannelHandler {
  readonly channel = "webhook" as const;

  async deliver(_notification: DeliverableNotification): Promise<DeliveryResult> {
    return {
      ok: false,
      reason:
        "Webhook kanaal is een placeholder. Implementeer HMAC-getekende POST + retry-beleid in fase 5+.",
    };
  }
}
