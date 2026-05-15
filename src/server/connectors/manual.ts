import type { SearchProfile, Source } from "@prisma/client";
import type {
  RawListingDraft,
  SourceConnector,
  SourceValidationResult,
} from "./types";

/**
 * ManualConnector — for sources that only accept manual_entry submissions.
 *
 * Listings come in via POST /api/listings/manual (admin UI), not via this
 * connector. The connector exists so the registry can answer "we know about
 * this source type" — running a crawl job against a manual source is a
 * no-op that succeeds with 0 items, instead of blowing up.
 *
 * `canHandle` accepts ANY source whose collection methods are exclusively
 * `manual_entry`. Mixed sources go to other connectors first.
 */
export class ManualConnector implements SourceConnector {
  readonly name = "manual-v1";
  readonly sourceType = "manual" as const;

  canHandle(source: Source): boolean {
    return (
      source.collectionMethods.length > 0 &&
      source.collectionMethods.every((m) => m === "manual_entry")
    );
  }

  async validateSource(source: Source): Promise<SourceValidationResult> {
    const issues: string[] = [];
    const warnings: string[] = [];
    if (!this.canHandle(source)) {
      issues.push("Source's collection methods are not exclusively manual_entry");
    }
    // Manual sources don't fetch externally, so legalStatus=green isn't
    // strictly required — but we still warn if a human hasn't reviewed it.
    if (source.legalStatus !== "green") {
      warnings.push(
        `legalStatus=${source.legalStatus}; manual sources are typically marked green explicitly`,
      );
    }
    return { ok: issues.length === 0, issues, warnings };
  }

  async fetchListings(
    _source: Source,
    _profile: SearchProfile | null,
  ): Promise<RawListingDraft[]> {
    // No-op. Manual listings flow through the admin API, not this connector.
    return [];
  }
}
