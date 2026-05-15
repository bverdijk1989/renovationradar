export {
  evaluateListingEvent,
  runDigest,
  runDailyDigest,
  runWeeklyDigest,
  dispatchPending,
  acknowledgeNotification,
  listUserNotifications,
} from "./engine";
export { match } from "./matcher";
export { Dispatcher } from "./delivery/dispatcher";
export { InAppChannelHandler } from "./delivery/in-app";
export { EmailChannelHandler } from "./delivery/email";
export { WebhookChannelHandler } from "./delivery/webhook";

export type {
  ListingEvent,
  MatchResult,
  ChannelHandler,
  DeliveryResult,
  DeliverableNotification,
  EvaluationSummary,
  DigestSummary,
} from "./types";
export type { ListingForMatching } from "./matcher";
