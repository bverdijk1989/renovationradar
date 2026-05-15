import type {
  Country,
  Language,
  SourceClassification,
} from "@prisma/client";

/**
 * Provider input. The engine resolves the country/language pair to a list of
 * queries via the query-generator; providers may also receive raw URLs
 * (the ManualImport provider's primary input).
 */
export type DiscoveryInput = {
  country: Country;
  language: Language;
  region?: string | null;
  /** Pre-built queries from the engine. Providers may inspect/ignore. */
  queries: string[];
  /** Free-form provider config (e.g. `urls` for ManualImport). */
  providerInput?: Record<string, unknown>;
};

/**
 * What a provider returns BEFORE the engine fetches + classifies the URL.
 * Just a URL and a one-line Dutch reason that surfaces in the review UI.
 */
export type RawCandidate = {
  url: string;
  discoveryReason: string;
  /** Optional already-known fields. Provider may skip if it doesn't have them. */
  preExtracted?: {
    name?: string | null;
    language?: Language | null;
    region?: string | null;
  };
};

/**
 * Fully-enriched candidate after fetch + classify + extract. The engine
 * persists this into Source (+ SourceReview + AuditLog).
 */
export type Candidate = {
  url: string;
  /** Resolved post-redirects (the URL the human reviewer will see). */
  finalUrl: string;

  name: string | null;
  country: Country;
  region: string | null;
  language: Language | null;

  email: string | null;
  phone: string | null;
  listingPageUrl: string | null;

  classification: SourceClassification;
  classificationConfidence: number;
  classificationEvidence: string[];

  discoveryReason: string;
  providerName: string;

  robotsAllowed: boolean;
  robotsEvidence: string;
};

/**
 * Provider contract. Implementations stay small: just turn an input into raw
 * URL candidates. The engine handles fetching, classification, extraction
 * and persistence — providers MUST NOT touch the database or write
 * SourceReview rows directly.
 */
export interface DiscoveryProvider {
  readonly name: string;
  discover(input: DiscoveryInput): Promise<RawCandidate[]>;
}

export type DiscoveryRunResult = {
  queriesGenerated: number;
  candidatesFetched: number;
  candidatesPersisted: number;
  candidatesSkipped: number;
  reasons: {
    skipped_existing: number;
    robots_blocked: number;
    fetch_failed: number;
  };
  candidates: Array<{
    sourceId: string | null; // null when skipped
    url: string;
    classification: SourceClassification;
    skipped: false | "existing" | "fetch_failed";
  }>;
};
