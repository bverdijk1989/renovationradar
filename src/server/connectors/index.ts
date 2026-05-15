export { runConnectorJob } from "./runner";
export { pickConnector, listConnectors } from "./registry";
export { FetchTransport, MockTransport } from "./transport";
export { InProcessRateLimiter, NoopRateLimiter } from "./rate-limit";

export { ManualConnector } from "./manual";
export { RssConnector } from "./rss";
export { SitemapConnector } from "./sitemap";
export { ApiConnector } from "./api";
export { PermittedHtmlConnector } from "./html";
export { EmailNewsletterConnector } from "./email";

export {
  ConnectorError,
  LegalGateError,
  NoConnectorError,
  SourceValidationError,
  TransportError,
  RateLimitError,
  ParseError,
  NotImplementedError,
} from "./errors";

export type {
  SourceConnector,
  SourceValidationResult,
  FetchContext,
  RawListingDraft,
  CrawlRunResult,
  HttpTransport,
  HttpResponse,
  RateLimiter,
} from "./types";
