import type {
  AlertChannel,
  NotificationEventType,
  NotificationStatus,
} from "@prisma/client";
import type { AlertCriteria } from "../schemas/alerts";

/**
 * A listing event triggers alert evaluation. Three event types are
 * supported; each carries the minimum context the matcher needs.
 */
export type ListingEvent =
  | { type: "new_match"; listingId: string }
  | { type: "special_object_added"; listingId: string }
  | { type: "price_drop"; listingId: string; previousPriceEur: number | null }
  | {
      type: "score_increased";
      listingId: string;
      previousCompositeScore: number | null;
    };

/**
 * Output of matcher.match(alert, listing, event). The evaluator uses this
 * to decide whether to create an AlertNotification row.
 */
export type MatchResult =
  | {
      matches: true;
      evidence: string[];
      eventType: NotificationEventType;
      /** Free-form snapshot stored on AlertNotification.payload. */
      payload: Record<string, unknown>;
    }
  | { matches: false; reason: string };

/**
 * Channel handler contract. Each handler delivers ONE notification at a
 * time; the dispatcher loops. In-app delivery is a no-op write (the row's
 * existence IS the in-app artifact). Email and webhook are placeholders.
 */
export interface ChannelHandler {
  readonly channel: AlertChannel;
  deliver(notification: DeliverableNotification): Promise<DeliveryResult>;
}

export type DeliveryResult =
  | { ok: true }
  | { ok: false; reason: string };

/** What the dispatcher hands to a channel handler. */
export type DeliverableNotification = {
  id: string;
  alertId: string;
  alertName: string;
  userId: string;
  channel: AlertChannel;
  eventType: NotificationEventType;
  payload: Record<string, unknown>;
  listing: {
    id: string;
    titleNl: string | null;
    titleOriginal: string;
    originalUrl: string;
    priceEur: number | null;
    country: string;
    city: string | null;
  };
};

export type EvaluationSummary = {
  listingId: string;
  evaluatedAlerts: number;
  matched: number;
  created: number;
  skippedDuplicates: number;
  dispatched: number;
  failed: number;
};

export type DigestSummary = {
  alertsProcessed: number;
  notificationsCreated: number;
  notificationsDispatched: number;
  notificationsFailed: number;
};

export type { AlertCriteria, NotificationEventType, NotificationStatus };
