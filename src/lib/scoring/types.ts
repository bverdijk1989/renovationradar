/**
 * Scoring types. Used by:
 *   - The scoring engine (phase 5) to produce ListingScore rows.
 *   - The dashboard (phase 3) to render explainability badges.
 *
 * Every individual score is normalised 0..100 so the UI can render them
 * uniformly (progress bars, color thresholds, sorting).
 */

export type ScoreComponent = {
  /** Stable id of the rule, e.g. "price.below_target" or "special.is_mill" */
  id: string;
  /** Human-readable label, localised in NL */
  label: string;
  /** Contribution in the same 0..100 space as the parent score */
  value: number;
  /** Multiplier applied when combining into composite (0..1) */
  weight: number;
};

export type ScoreBreakdown = {
  components: ScoreComponent[];
  /** Free-form notes, e.g. "land area missing - defaulted to neutral" */
  notes?: string[];
};

export type ListingScores = {
  matchScore: number;
  renovationScore: number;
  specialObjectScore: number;
  dataConfidence: number;
  investmentPotentialScore: number;
  compositeScore: number;
  breakdown: ScoreBreakdown;
};

/**
 * Composite weights. The composite is a weighted average of the five
 * primary scores. Special object weight is highest because the brief
 * explicitly asks for special objects to surface above generic stock.
 */
export const COMPOSITE_WEIGHTS = Object.freeze({
  matchScore: 0.30,
  renovationScore: 0.15,
  specialObjectScore: 0.30,
  dataConfidence: 0.10,
  investmentPotentialScore: 0.15,
});

export function composeScore(
  scores: Omit<ListingScores, "compositeScore" | "breakdown">,
): number {
  const w = COMPOSITE_WEIGHTS;
  return (
    scores.matchScore * w.matchScore +
    scores.renovationScore * w.renovationScore +
    scores.specialObjectScore * w.specialObjectScore +
    scores.dataConfidence * w.dataConfidence +
    scores.investmentPotentialScore * w.investmentPotentialScore
  );
}

/** Clamp helper so component math can't escape 0..100. */
export function clamp01_100(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
