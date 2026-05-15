import type { ScoringConfig } from "./config";
import type { ScoreComponent, ScoringInput } from "./types";

/**
 * match_score (0..100): how well does this listing fit the brief's HARD
 * criteria? Built from 8 explicit components per the brief:
 *
 *   price (20) · distance (15) · land (20) · detached (15)
 *   electricity (10) · water (5) · renovation (10) · special bonus (5)
 *   = 100
 *
 * Continuous components (price, distance, land) use a linear decay outside
 * the target window so a listing that's 10% over the price ceiling isn't
 * scored identically to one that's 50% over.
 */
export function scoreMatch(
  input: ScoringInput,
  config: ScoringConfig,
): { score: number; components: ScoreComponent[] } {
  const components: ScoreComponent[] = [];

  // -------- Price ----------------------------------------------------------
  const price = scorePrice(input.priceEur, config);
  components.push({
    id: "match.price",
    label: "Prijs",
    points: price.points,
    max: config.matchPoints.price,
    evidence: price.evidence,
  });

  // -------- Distance -------------------------------------------------------
  const distance = scoreDistance(input.location?.distanceFromVenloKm ?? null, config);
  components.push({
    id: "match.distance",
    label: "Afstand vanaf Venlo",
    points: distance.points,
    max: config.matchPoints.distance,
    evidence: distance.evidence,
  });

  // -------- Land area ------------------------------------------------------
  const land = scoreLand(input.landAreaM2, config);
  components.push({
    id: "match.land",
    label: "Grondoppervlak",
    points: land.points,
    max: config.matchPoints.land,
    evidence: land.evidence,
  });

  // -------- Detached -------------------------------------------------------
  const detached = scoreDetached(input.isDetached, config);
  components.push({
    id: "match.detached",
    label: "Vrijstaand",
    points: detached.points,
    max: config.matchPoints.detached,
    evidence: detached.evidence,
  });

  // -------- Electricity ----------------------------------------------------
  const electricity = scoreUtility(
    input.electricityStatus,
    config.matchPoints.electricity,
    "stroom",
  );
  components.push({
    id: "match.electricity",
    label: "Stroom",
    points: electricity.points,
    max: config.matchPoints.electricity,
    evidence: electricity.evidence,
  });

  // -------- Water ----------------------------------------------------------
  const water = scoreUtility(input.waterStatus, config.matchPoints.water, "water");
  components.push({
    id: "match.water",
    label: "Water",
    points: water.points,
    max: config.matchPoints.water,
    evidence: water.evidence,
  });

  // -------- Renovation indication -----------------------------------------
  const renovation = scoreRenovationIndication(input.renovationStatus, config);
  components.push({
    id: "match.renovation",
    label: "Renovatie-indicatie",
    points: renovation.points,
    max: config.matchPoints.renovation,
    evidence: renovation.evidence,
  });

  // -------- Special object bonus ------------------------------------------
  const special = scoreSpecialBonus(input.isSpecialObject, config);
  components.push({
    id: "match.special_bonus",
    label: "Bijzonder object (bonus)",
    points: special.points,
    max: config.matchPoints.specialBonus,
    evidence: special.evidence,
  });

  const score = clamp01_100(components.reduce((s, c) => s + c.points, 0));
  return { score, components };
}

// ---------------------------------------------------------------------------
// Individual scorers — each returns { points, evidence } in the same shape
// so the parent function above is just plumbing.
// ---------------------------------------------------------------------------

function scorePrice(price: number | null, c: ScoringConfig): Scored {
  const max = c.matchPoints.price;
  if (price == null) {
    return { points: 0, evidence: "prijs onbekend → 0 pt" };
  }
  if (price <= c.priceTargetEur) {
    return {
      points: max,
      evidence: `€${formatEur(price)} ≤ €${formatEur(c.priceTargetEur)} → ${max} pt`,
    };
  }
  const over = price - c.priceTargetEur;
  const remaining = Math.max(0, 1 - over / c.priceDecayEur);
  const pts = Math.round(remaining * max);
  return {
    points: pts,
    evidence: `€${formatEur(price)} > €${formatEur(c.priceTargetEur)} (lineaire decay over €${formatEur(c.priceDecayEur)}) → ${pts} pt`,
  };
}

function scoreDistance(distanceKm: number | null, c: ScoringConfig): Scored {
  const max = c.matchPoints.distance;
  if (distanceKm == null) {
    return { points: Math.round(max * 0.4), evidence: "afstand onbekend → 40% van max" };
  }
  if (distanceKm <= c.distanceTargetKm) {
    return {
      points: max,
      evidence: `${roundKm(distanceKm)} km ≤ ${c.distanceTargetKm} km → ${max} pt`,
    };
  }
  const over = distanceKm - c.distanceTargetKm;
  const remaining = Math.max(0, 1 - over / c.distanceDecayKm);
  const pts = Math.round(remaining * max);
  return {
    points: pts,
    evidence: `${roundKm(distanceKm)} km > ${c.distanceTargetKm} km → ${pts} pt`,
  };
}

function scoreLand(m2: number | null, c: ScoringConfig): Scored {
  const max = c.matchPoints.land;
  if (m2 == null) return { points: 0, evidence: "grondoppervlak onbekend → 0 pt" };
  if (m2 >= c.landTargetM2) {
    return {
      points: max,
      evidence: `${formatHa(m2)} ≥ ${formatHa(c.landTargetM2)} → ${max} pt`,
    };
  }
  if (m2 <= c.landFloorM2) {
    return {
      points: 0,
      evidence: `${formatHa(m2)} ≤ ${formatHa(c.landFloorM2)} (vloer) → 0 pt`,
    };
  }
  // Linear between floor and target.
  const ratio = (m2 - c.landFloorM2) / (c.landTargetM2 - c.landFloorM2);
  const pts = Math.round(ratio * max);
  return {
    points: pts,
    evidence: `${formatHa(m2)} (lineair tussen ${formatHa(c.landFloorM2)} en ${formatHa(c.landTargetM2)}) → ${pts} pt`,
  };
}

function scoreDetached(flag: ScoringInput["isDetached"], c: ScoringConfig): Scored {
  const max = c.matchPoints.detached;
  if (flag === "yes") return { points: max, evidence: `vrijstaand=ja → ${max} pt` };
  if (flag === "no") return { points: 0, evidence: "vrijstaand=nee → 0 pt" };
  return {
    points: Math.round(max * 0.4),
    evidence: `vrijstaand=onbekend → 40% van max`,
  };
}

function scoreUtility(
  status: ScoringInput["electricityStatus"],
  max: number,
  utility: string,
): Scored {
  switch (status) {
    case "present":
      return { points: max, evidence: `${utility} aanwezig → ${max} pt` };
    case "likely":
      return {
        points: Math.round(max * 0.7),
        evidence: `${utility} waarschijnlijk → 70% van max`,
      };
    case "unknown":
      return {
        points: Math.round(max * 0.3),
        evidence: `${utility} onbekend → 30% van max`,
      };
    case "absent":
      return { points: 0, evidence: `${utility} afwezig → 0 pt` };
  }
}

function scoreRenovationIndication(
  status: ScoringInput["renovationStatus"],
  c: ScoringConfig,
): Scored {
  const max = c.matchPoints.renovation;
  switch (status) {
    case "ruin":
      return { points: max, evidence: `ruïne → ${max} pt (volledige renovatie-indicatie)` };
    case "needs_renovation":
      return { points: max, evidence: `te renoveren → ${max} pt` };
    case "partial_renovation":
      return {
        points: Math.round(max * 0.5),
        evidence: `gedeeltelijk gerenoveerd → 50% van max`,
      };
    case "move_in_ready":
      return { points: 0, evidence: "instapklaar → 0 pt (geen renovatie-indicatie)" };
    case "unknown":
      return {
        points: Math.round(max * 0.3),
        evidence: "renovatiestatus onbekend → 30% van max",
      };
  }
}

function scoreSpecialBonus(isSpecial: boolean, c: ScoringConfig): Scored {
  const max = c.matchPoints.specialBonus;
  if (isSpecial) return { points: max, evidence: `bijzonder object → ${max} pt bonus` };
  return { points: 0, evidence: "geen bijzonder object → 0 pt" };
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

type Scored = { points: number; evidence: string };

function clamp01_100(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function formatEur(n: number): string {
  return new Intl.NumberFormat("nl-NL").format(Math.round(n));
}

function formatHa(m2: number): string {
  if (m2 >= 10_000) {
    return `${(m2 / 10_000).toFixed(1).replace(".", ",")} ha`;
  }
  return `${formatEur(m2)} m²`;
}

function roundKm(km: number): number {
  return Math.round(km * 10) / 10;
}
