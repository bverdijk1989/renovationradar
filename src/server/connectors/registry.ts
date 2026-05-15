import type { Source } from "@prisma/client";
import { NoConnectorError } from "./errors";
import type { SourceConnector } from "./types";
import { ManualConnector } from "./manual";
import { RssConnector } from "./rss";
import { SitemapConnector } from "./sitemap";
import { ApiConnector } from "./api";
import { PermittedHtmlConnector } from "./html";
import { EmailNewsletterConnector } from "./email";

/**
 * Registry of all known connectors, in priority order. Order matters: the
 * first one whose `canHandle()` returns true wins. Manual is listed first
 * so a source with `[manual_entry]` collection method always picks it,
 * even if other methods are listed.
 */
const REGISTRY: SourceConnector[] = [
  new ManualConnector(),
  new RssConnector(),
  new SitemapConnector(),
  new ApiConnector(),
  new PermittedHtmlConnector(),
  new EmailNewsletterConnector(),
];

/**
 * Find the connector that wants to handle this source. Throws when nothing
 * matches — the runner converts that into a failed CrawlJob.
 */
export function pickConnector(source: Source): SourceConnector {
  for (const c of REGISTRY) {
    if (c.canHandle(source)) return c;
  }
  throw new NoConnectorError(
    `No connector registered for source ${source.id} (type=${source.sourceType}, methods=${source.collectionMethods.join("|")})`,
  );
}

/** Read-only view of the registry. Useful for diagnostics + tests. */
export function listConnectors(): readonly SourceConnector[] {
  return REGISTRY;
}
