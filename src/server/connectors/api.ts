import type { SearchProfile, Source } from "@prisma/client";
import { NotImplementedError } from "./errors";
import type {
  FetchContext,
  RawListingDraft,
  SourceConnector,
  SourceValidationResult,
} from "./types";

/**
 * ApiConnector — placeholder.
 *
 * The shape is final so a real implementation can drop in without changing
 * the registry or runner. Concrete implementation depends on the target
 * API's auth, pagination and rate-limit semantics; each will likely be a
 * subclass of this base that overrides `fetchListings`.
 *
 * Recommended composition once implemented:
 *   1. Read connectorConfig.endpoint / auth from the Source row.
 *   2. Paginate using the API's native cursor.
 *   3. For each page, call ctx.rateLimiter.wait() before the next request.
 *   4. Map each row into a RawListingDraft with `payload.raw` set to the
 *      verbatim API response (essential for re-parsing later).
 */
export class ApiConnector implements SourceConnector {
  readonly name = "api-v0-stub";
  readonly sourceType = "api" as const;

  canHandle(source: Source): boolean {
    return (
      source.sourceType === "api" ||
      source.collectionMethods.includes("api")
    );
  }

  async validateSource(source: Source): Promise<SourceValidationResult> {
    // Always fails validation so the runner stops here rather than calling
    // the unimplemented fetchListings(). Real implementations replace this.
    return {
      ok: false,
      issues: [
        "ApiConnector is a placeholder for fase 5+. Implement a source-specific subclass and override fetchListings().",
      ],
      warnings: [
        `Source ${source.id} declares sourceType=api but no concrete connector is wired yet.`,
      ],
    };
  }

  async fetchListings(
    _source: Source,
    _profile: SearchProfile | null,
    _ctx: FetchContext,
  ): Promise<RawListingDraft[]> {
    throw new NotImplementedError(
      "ApiConnector is a placeholder. See docs/CONNECTORS.md for how to subclass it.",
    );
  }
}
