import type { ExtractionResult, FieldExtraction } from "./types";

/**
 * Per-field weights for the aggregated `data_confidence` score.
 *
 * Rationale (Renovation Radar's brief):
 *   - Price + land + country are the hard filters → highest weight.
 *   - Special-object flag and detached flag drive scoring → high weight.
 *   - Renovation status is important for ranking but rarely fatal → medium.
 *   - Living area, rooms, utilities are nice-to-have details → low weight.
 *
 * Weights sum to 1.0 so the output is naturally 0..100 after scaling.
 */
export const FIELD_WEIGHTS = Object.freeze({
  language: 0.05,
  priceEur: 0.20,
  landAreaM2: 0.18,
  livingAreaM2: 0.05,
  rooms: 0.03,
  propertyType: 0.12,
  isDetached: 0.10,
  renovationStatus: 0.10,
  isSpecialObject: 0.07,
  specialObjectType: 0.03,
  electricityStatus: 0.04,
  waterStatus: 0.03,
} as const);

type FieldKey = keyof typeof FIELD_WEIGHTS;

/**
 * Aggregates per-field confidences into a single 0..100 score.
 *
 * Fields with `value: null` contribute 0 (no data). Fields with a value
 * contribute `confidence × weight × 100`. A perfect extraction (every field
 * found with confidence 1.0) returns 100.
 */
export function aggregateConfidence(result: ExtractionResult): number {
  let total = 0;
  for (const [key, weight] of Object.entries(FIELD_WEIGHTS) as Array<[FieldKey, number]>) {
    const fe = result[key] as FieldExtraction<unknown>;
    if (fe.value !== null) {
      total += fe.confidence * weight;
    }
  }
  return Math.round(Math.max(0, Math.min(1, total)) * 100);
}

/** Sanity check: the sum of weights must equal 1.0 (within float epsilon). */
export function _weightsSumToOne(): boolean {
  const sum = Object.values(FIELD_WEIGHTS).reduce((a, b) => a + b, 0);
  return Math.abs(sum - 1) < 1e-9;
}
