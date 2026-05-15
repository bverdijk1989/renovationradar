import { ProviderNotImplementedError } from "../errors";
import type {
  DiscoveryInput,
  DiscoveryProvider,
  RawCandidate,
} from "../types";

/**
 * SearchApi — placeholder.
 *
 * Real implementation will plug into Bing Web Search / Brave Search /
 * SerpAPI / etc. Recommended composition:
 *
 *   1. For each query in input.queries, call the search API with a
 *      country-restricted region filter.
 *   2. Take the top N organic results (skip ads, news, knowledge cards).
 *   3. Filter out known portal domains BEFORE returning — they'd just
 *      waste classifier cycles.
 *   4. Return a RawCandidate per remaining URL with a `discoveryReason`
 *      that quotes the original query for the review UI.
 *
 * Why a stub now? The legal + cost analysis for an external search API
 * belongs in its own SourceReview / contract. Until then, ManualImport is
 * the production path.
 */
export class SearchApiProvider implements DiscoveryProvider {
  readonly name = "search-api-v0-stub";

  async discover(_input: DiscoveryInput): Promise<RawCandidate[]> {
    throw new ProviderNotImplementedError(
      "SearchApiProvider is a placeholder. See docs/DISCOVERY.md for the recommended integration.",
    );
  }
}
