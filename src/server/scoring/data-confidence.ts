import type { ScoreComponent, ScoringInput } from "./types";

/**
 * data_confidence (0..100): how complete and trustworthy is the data for
 * this listing? Two paths:
 *
 *   1. If the normalization engine produced a confidence (passed via
 *      `normalizationConfidence`), trust it verbatim. That value is
 *      already a 0..100 weighted blend of per-field extraction confidences.
 *
 *   2. Otherwise, compute a fallback: fraction of expected fields populated,
 *      capped at 100. This handles legacy / manually-entered listings.
 */
export function scoreDataConfidence(
  input: ScoringInput,
): { score: number; components: ScoreComponent[] } {
  const components: ScoreComponent[] = [];

  if (input.normalizationConfidence != null) {
    const v = clamp(input.normalizationConfidence);
    components.push({
      id: "data.from_normalization",
      label: "Data-confidence (uit normalisatie)",
      points: v,
      max: 100,
      evidence: `normalization-engine: ${v}`,
    });
    return { score: v, components };
  }

  // Fallback heuristic.
  const fields: Array<[string, unknown, number]> = [
    ["prijs", input.priceEur, 25],
    ["grondoppervlak", input.landAreaM2, 20],
    ["woonoppervlak", input.livingAreaM2, 5],
    ["woningtype", input.propertyType !== "unknown" ? input.propertyType : null, 12],
    ["vrijstaand-flag", input.isDetached !== "unknown" ? input.isDetached : null, 10],
    [
      "renovatiestatus",
      input.renovationStatus !== "unknown" ? input.renovationStatus : null,
      10,
    ],
    ["stroom", input.electricityStatus !== "unknown" ? input.electricityStatus : null, 4],
    ["water", input.waterStatus !== "unknown" ? input.waterStatus : null, 3],
    ["locatie", input.location?.distanceFromVenloKm ?? null, 11],
  ];

  let total = 0;
  const missing: string[] = [];
  for (const [name, value, weight] of fields) {
    if (value !== null && value !== undefined) {
      total += weight;
    } else {
      missing.push(name);
    }
  }
  const score = clamp(total);
  components.push({
    id: "data.field_populated_fallback",
    label: "Veld-volledigheid (fallback)",
    points: score,
    max: 100,
    evidence:
      missing.length === 0
        ? "alle verwachte velden aanwezig"
        : `ontbrekend: ${missing.join(", ")}`,
  });
  return { score, components };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
