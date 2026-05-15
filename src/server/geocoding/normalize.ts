import { createHash } from "node:crypto";
import type { GeocodeQuery } from "./types";

/**
 * Deterministic, locale-aware query normalisation. Two queries that should
 * cache as the same key MUST produce identical strings here.
 *
 * Rules:
 *   - Lowercase, strip accents (NFD + diacritic strip)
 *   - Collapse internal whitespace
 *   - Drop punctuation other than letters/digits/spaces
 *   - Strip leading "rue" / "straße" article noise? — no, addresses
 *     differ meaningfully by their structure; keep verbatim.
 */
function normalisePart(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The string that gets hashed for the cache key. Exposed for tests + debugging. */
export function normalisedQueryString(q: GeocodeQuery): string {
  return [
    q.country,
    normalisePart(q.region),
    normalisePart(q.city),
    normalisePart(q.postalCode),
    normalisePart(q.addressLine),
  ].join("|");
}

export function hashQuery(q: GeocodeQuery): string {
  return createHash("sha256").update(normalisedQueryString(q)).digest("hex");
}

/**
 * Decide which level of confidence the query itself supports. The provider's
 * own opinion can NEVER exceed this — a city-only query won't be high-confidence
 * regardless of what the geocoder claims.
 */
export function queryUpperBoundConfidence(
  q: GeocodeQuery,
): "high" | "medium" | "low" | "none" {
  const hasAddr = !!q.addressLine && q.addressLine.trim().length > 0;
  const hasPostal = !!q.postalCode && q.postalCode.trim().length > 0;
  const hasCity = !!q.city && q.city.trim().length > 0;
  const hasRegion = !!q.region && q.region.trim().length > 0;

  if (hasAddr && hasPostal && hasCity) return "high";
  if (hasPostal && hasCity) return "high";
  if (hasAddr && hasCity) return "high";
  if (hasCity) return "medium";
  if (hasRegion) return "low";
  return "none";
}

/** Human-readable query for cache.query column + debugging. */
export function describeQuery(q: GeocodeQuery): string {
  return [q.addressLine, q.postalCode, q.city, q.region, q.country]
    .filter(Boolean)
    .join(", ");
}
