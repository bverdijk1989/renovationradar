import type { Language, SearchProfile, Source, SourceType } from "@prisma/client";

/**
 * The uniform contract every connector implements. The brief's signature
 * verbatim, plus a `name` for logging / registry-lookups.
 *
 * `canHandle()` is sync because picking the right connector for a source
 * MUST be a cheap decision — the runner calls it for every job.
 * `validateSource()` is async because it may consult robots.txt, ToS
 * snapshots, or live connectivity checks.
 * `fetchListings()` is async because the actual work hits the network.
 */
export interface SourceConnector {
  readonly name: string;
  readonly sourceType: SourceType;
  canHandle(source: Source): boolean;
  validateSource(source: Source): Promise<SourceValidationResult>;
  fetchListings(
    source: Source,
    profile: SearchProfile | null,
    ctx: FetchContext,
  ): Promise<RawListingDraft[]>;
}

/**
 * Validation outcome. `ok=true` means the connector is willing to run
 * against this source RIGHT NOW. `issues` carries blocking reasons
 * (legal, missing config, unreachable host) and `warnings` carries
 * non-blocking observations (rate limit looks tight, no User-Agent set).
 *
 * The runner refuses to invoke fetchListings() unless `ok=true`.
 */
export type SourceValidationResult = {
  ok: boolean;
  issues: string[];
  warnings: string[];
};

/**
 * Per-job context the runner supplies to a connector. Lets us inject mocks
 * for HTTP and rate-limiting in tests without changing connector code.
 */
export type FetchContext = {
  transport: HttpTransport;
  rateLimiter: RateLimiter;
  /** ID of the CrawlJob row; written into RawListing meta for traceability. */
  crawlJobId: string;
  /** Optional cancellation signal honoured by long-running fetches. */
  signal?: AbortSignal;
};

/**
 * Draft of a RawListing that the connector hands back. The runner is
 * responsible for hashing the payload, deduping via (sourceId, contentHash),
 * and writing the actual RawListing row.
 */
export type RawListingDraft = {
  externalId: string | null;
  url: string;
  payload: Record<string, unknown>;
  language?: Language | null;
};

// ---------------------------------------------------------------------------
// Transport + rate-limit interfaces (mockable in tests)
// ---------------------------------------------------------------------------

export interface HttpTransport {
  get(
    url: string,
    opts?: {
      headers?: Record<string, string>;
      signal?: AbortSignal;
      /** Max wall-clock time before throwing. Defaults vary per impl. */
      timeoutMs?: number;
    },
  ): Promise<HttpResponse>;
}

export type HttpResponse = {
  status: number;
  headers: Record<string, string>;
  body: string;
  /** Final URL after redirects (the URL we should remember as canonical). */
  url: string;
};

export interface RateLimiter {
  /** Resolves when the caller may proceed; throws if cancelled. */
  wait(sourceId: string, rateLimitPerMinute: number | null): Promise<void>;
}

// ---------------------------------------------------------------------------
// Runner outputs
// ---------------------------------------------------------------------------

/**
 * Summary returned by the runner. Mirrors the fields persisted on CrawlJob
 * so callers (BullMQ worker, /api/jobs/:id/execute endpoint) can return it
 * directly without re-fetching.
 */
export type CrawlRunResult = {
  jobId: string;
  ok: boolean;
  itemsFetched: number;
  itemsAccepted: number;
  itemsRejected: number;
  errorMessage: string | null;
};
