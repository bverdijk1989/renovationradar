import type { SearchProfile, Source } from "@prisma/client";
import { NotImplementedError } from "./errors";
import type {
  FetchContext,
  RawListingDraft,
  SourceConnector,
  SourceValidationResult,
} from "./types";

/**
 * PermittedHtmlConnector — placeholder for HTML scraping where the source
 * has EXPLICITLY granted permission (private agreement, contracted feed
 * substitute, robots.txt that permits the path, ToS that allows scraping).
 *
 * Naming chosen deliberately: this is NOT a generic web scraper. The
 * registry will only pick this connector when:
 *   - source.collectionMethods includes `scrape_with_permission`
 *   - source.legalStatus = green
 *   - a recent SourceReview row attests to that decision
 *
 * Real implementations need:
 *   1. Polite politeness: explicit per-source request budget,
 *      respect for Retry-After.
 *   2. A purpose-built parser (Cheerio) per site layout — no AI scraping.
 *   3. Stable selectors stored in connectorConfig so a layout change
 *      isn't a silent disaster.
 */
export class PermittedHtmlConnector implements SourceConnector {
  readonly name = "html-v0-stub";
  readonly sourceType = "scrape" as const;

  canHandle(source: Source): boolean {
    return (
      source.sourceType === "scrape" ||
      source.collectionMethods.includes("scrape_with_permission")
    );
  }

  async validateSource(source: Source): Promise<SourceValidationResult> {
    const issues: string[] = [
      "PermittedHtmlConnector is a placeholder for fase 5+. Implement a site-specific subclass and override fetchListings().",
    ];
    if (!source.collectionMethods.includes("scrape_with_permission")) {
      issues.push(
        "Source must include 'scrape_with_permission' in collectionMethods before this connector can run.",
      );
    }
    return { ok: false, issues, warnings: [] };
  }

  async fetchListings(
    _source: Source,
    _profile: SearchProfile | null,
    _ctx: FetchContext,
  ): Promise<RawListingDraft[]> {
    throw new NotImplementedError(
      "PermittedHtmlConnector is a placeholder. Use a site-specific subclass with Cheerio + explicit permission audit.",
    );
  }
}
