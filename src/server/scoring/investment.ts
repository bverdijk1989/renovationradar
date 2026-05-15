import type { ScoringConfig } from "./config";
import type { ScoreComponent, ScoringInput } from "./types";

/**
 * investment_potential_score (0..100): rough estimate of upside.
 *
 * Combines (per the brief):
 *   - lage prijs per m² grond          → 25 pt
 *   - hoeveelheid grond                → 20 pt
 *   - bijzonder object                 → 15 pt
 *   - locatieafstand (dichterbij = beter) → 15 pt
 *   - renovatiestatus (meer werk = meer upside) → 20 pt
 *   - completeness van data            → 5  pt
 *   Total = 100
 *
 * Each component returns 0..max so the sum is naturally clamped.
 */
export function scoreInvestment(
  input: ScoringInput,
  config: ScoringConfig,
  dataConfidence: number,
): { score: number; components: ScoreComponent[] } {
  const components: ScoreComponent[] = [];

  // -------- Price per m² of land ------------------------------------------
  if (input.priceEur != null && input.landAreaM2 != null && input.landAreaM2 > 0) {
    const ppm2 = input.priceEur / input.landAreaM2;
    // Heuristic: ≤5 €/m² = top, 25 €/m² = floor. Linear in between.
    const TOP = 5;
    const FLOOR = 25;
    const span = FLOOR - TOP;
    const ratio = Math.max(0, Math.min(1, (FLOOR - ppm2) / span));
    const pts = Math.round(ratio * 25);
    components.push({
      id: "investment.price_per_m2",
      label: "Prijs per m² grond",
      points: pts,
      max: 25,
      evidence: `${ppm2.toFixed(2)} €/m² → ${pts} pt (top: ${TOP} €/m², vloer: ${FLOOR} €/m²)`,
    });
  } else {
    components.push({
      id: "investment.price_per_m2",
      label: "Prijs per m² grond",
      points: 0,
      max: 25,
      evidence: "prijs of grond onbekend",
    });
  }

  // -------- Land amount (bonus for >1 ha) ---------------------------------
  if (input.landAreaM2 != null) {
    // 10k m² = baseline (10 pt). 30k+ m² = full (20 pt). Below 10k = 0.
    const m = input.landAreaM2;
    const pts = m >= 30_000 ? 20 : m >= 10_000 ? 10 + Math.round(((m - 10_000) / 20_000) * 10) : 0;
    components.push({
      id: "investment.land_amount",
      label: "Hoeveelheid grond",
      points: pts,
      max: 20,
      evidence: `${m} m² → ${pts} pt`,
    });
  } else {
    components.push({
      id: "investment.land_amount",
      label: "Hoeveelheid grond",
      points: 0,
      max: 20,
      evidence: "grondoppervlak onbekend",
    });
  }

  // -------- Special object -------------------------------------------------
  const specialPts = input.isSpecialObject ? 15 : 0;
  components.push({
    id: "investment.special_object",
    label: "Bijzonder object",
    points: specialPts,
    max: 15,
    evidence: input.isSpecialObject
      ? "bijzonder object → 15 pt"
      : "geen bijzonder object → 0 pt",
  });

  // -------- Distance (closer = easier to manage) --------------------------
  const distance = input.location?.distanceFromVenloKm ?? null;
  let distancePts = 0;
  let distanceEvidence = "afstand onbekend";
  if (distance != null) {
    if (distance <= 100) {
      distancePts = 15;
      distanceEvidence = `${roundKm(distance)} km ≤ 100 km → 15 pt`;
    } else if (distance <= config.distanceTargetKm) {
      // 100..350 → 15..5 linear
      const ratio = 1 - (distance - 100) / (config.distanceTargetKm - 100);
      distancePts = Math.round(5 + ratio * 10);
      distanceEvidence = `${roundKm(distance)} km in middenband → ${distancePts} pt`;
    } else {
      // > 350 → 0..5 linear over 150 km
      const ratio = Math.max(0, 1 - (distance - config.distanceTargetKm) / 150);
      distancePts = Math.round(ratio * 5);
      distanceEvidence = `${roundKm(distance)} km buiten target → ${distancePts} pt`;
    }
  }
  components.push({
    id: "investment.distance",
    label: "Locatieafstand",
    points: distancePts,
    max: 15,
    evidence: distanceEvidence,
  });

  // -------- Renovation upside ---------------------------------------------
  const renoMap: Record<string, number> = {
    ruin: 20,
    needs_renovation: 18,
    partial_renovation: 10,
    move_in_ready: 5,
    unknown: 8,
  };
  const renoPts = renoMap[input.renovationStatus] ?? 8;
  components.push({
    id: "investment.renovation",
    label: "Renovatiestatus (upside)",
    points: renoPts,
    max: 20,
    evidence: `renovatiestatus=${input.renovationStatus} → ${renoPts} pt`,
  });

  // -------- Data confidence -----------------------------------------------
  // Higher confidence = lower risk premium. dataConfidence is already 0..100.
  const confidencePts = Math.round((dataConfidence / 100) * 5);
  components.push({
    id: "investment.data_confidence",
    label: "Data-vertrouwen",
    points: confidencePts,
    max: 5,
    evidence: `data-confidence ${dataConfidence}/100 → ${confidencePts} pt`,
  });

  const total = components.reduce((s, c) => s + c.points, 0);
  return { score: clamp(total), components };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}
