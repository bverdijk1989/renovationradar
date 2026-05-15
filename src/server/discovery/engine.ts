import "server-only";
import type { HttpTransport } from "@/server/connectors";
import { FetchTransport } from "@/server/connectors";
import { classify } from "./classifier";
import { extract } from "./extractor";
import { checkRobots } from "./robots";
import { persistCandidate } from "./persist";
import { generateQueries } from "./query-generator";
import { ManualImportProvider } from "./providers/manual-import";
import { SearchApiProvider } from "./providers/search-api";
import type {
  Candidate,
  DiscoveryInput,
  DiscoveryProvider,
  DiscoveryRunResult,
} from "./types";

/**
 * High-level entry point for the Discovery Engine.
 *
 *   1. Generate queries (deterministic).
 *   2. Ask the provider for raw URL candidates.
 *   3. For each candidate URL:
 *        a. Check robots.txt — skip if disallowed.
 *        b. Fetch the page (TransportError → skip with reason).
 *        c. Classify + extract metadata.
 *        d. Persist as a pending Source + SourceReview row.
 *   4. Return a summary.
 *
 * IMPORTANT legal rails:
 *   - We never auto-activate. `persistCandidate` writes status=pending_review.
 *   - We never bypass robots.txt — disallowed URLs go straight to the review
 *     queue with `classification=unknown` so a human can decide manually.
 *   - Every persisted source produces an AuditLog row.
 */

export async function discoverAgencies(input: {
  provider: DiscoveryProvider;
  country: DiscoveryInput["country"];
  language: DiscoveryInput["language"];
  region?: string | null;
  providerInput?: Record<string, unknown>;
  /** Default real FetchTransport; tests inject MockTransport. */
  transport?: HttpTransport;
  actorUserId?: string | null;
  userAgent?: string;
}): Promise<DiscoveryRunResult> {
  const transport = input.transport ?? new FetchTransport();
  const userAgent =
    input.userAgent ??
    "RenovationRadar-Discovery/0.1 (+contact: admin@example.com)";

  const queries = generateQueries({
    country: input.country,
    language: input.language,
    region: input.region,
  });

  const rawCandidates = await input.provider.discover({
    country: input.country,
    language: input.language,
    region: input.region,
    queries,
    providerInput: input.providerInput,
  });

  const summary: DiscoveryRunResult = {
    queriesGenerated: queries.length,
    candidatesFetched: 0,
    candidatesPersisted: 0,
    candidatesSkipped: 0,
    reasons: { skipped_existing: 0, robots_blocked: 0, fetch_failed: 0 },
    candidates: [],
  };

  for (const raw of rawCandidates) {
    summary.candidatesFetched += 1;

    // --- robots.txt --------------------------------------------------------
    const robots = await checkRobots(raw.url, userAgent, transport);

    let html = "";
    let finalUrl = raw.url;
    let fetchOk = false;

    if (robots.allowed) {
      try {
        const res = await transport.get(raw.url, {
          headers: { "User-Agent": userAgent },
          timeoutMs: 10_000,
        });
        html = res.body;
        finalUrl = res.url;
        fetchOk = true;
      } catch (err) {
        summary.reasons.fetch_failed += 1;
        summary.candidates.push({
          sourceId: null,
          url: raw.url,
          classification: "unknown",
          skipped: "fetch_failed",
        });
        summary.candidatesSkipped += 1;
        // eslint-disable-next-line no-console
        console.warn(`[discovery] fetch failed for ${raw.url}:`, (err as Error).message);
        continue;
      }
    } else {
      summary.reasons.robots_blocked += 1;
      // Robots-blocked candidates still surface in the queue so a human can
      // decide. classification stays `unknown`.
    }

    // --- classify + extract -------------------------------------------------
    const classification = fetchOk
      ? classify({ url: finalUrl, html })
      : {
          classification: "unknown" as const,
          confidence: 0,
          evidence: [`robots.txt blokkeerde fetch: ${robots.evidence}`],
        };

    const metadata = fetchOk
      ? extract({ url: finalUrl, html, hintLanguage: raw.preExtracted?.language ?? null })
      : {
          name: raw.preExtracted?.name ?? null,
          language: raw.preExtracted?.language ?? null,
          email: null,
          phone: null,
          listingPageUrl: null,
          region: raw.preExtracted?.region ?? null,
        };

    const candidate: Candidate = {
      url: raw.url,
      finalUrl,
      name: metadata.name,
      country: input.country,
      region: metadata.region ?? input.region ?? null,
      language: metadata.language ?? input.language,
      email: metadata.email,
      phone: metadata.phone,
      listingPageUrl: metadata.listingPageUrl,
      classification: classification.classification,
      classificationConfidence: classification.confidence,
      classificationEvidence: classification.evidence,
      discoveryReason: raw.discoveryReason,
      providerName: input.provider.name,
      robotsAllowed: robots.allowed,
      robotsEvidence: robots.evidence,
    };

    // --- persist ------------------------------------------------------------
    const { sourceId, created } = await persistCandidate(candidate, {
      actorUserId: input.actorUserId,
    });
    if (!created) {
      summary.reasons.skipped_existing += 1;
      summary.candidatesSkipped += 1;
      summary.candidates.push({
        sourceId,
        url: finalUrl,
        classification: candidate.classification,
        skipped: "existing",
      });
    } else {
      summary.candidatesPersisted += 1;
      summary.candidates.push({
        sourceId,
        url: finalUrl,
        classification: candidate.classification,
        skipped: false,
      });
    }
  }

  return summary;
}

// Re-export the providers so callers can pick the one they want.
export { ManualImportProvider, SearchApiProvider };
