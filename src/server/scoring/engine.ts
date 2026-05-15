import { DEFAULT_SCORING_CONFIG, makeScoringConfig, type ScoringConfig } from "./config";
import { scoreMatch } from "./match";
import { scoreRenovation } from "./renovation";
import { scoreSpecialObject } from "./special";
import { scoreDataConfidence } from "./data-confidence";
import { scoreInvestment } from "./investment";
import type { ScoringInput, ScoringResult } from "./types";

/**
 * Compute all 5 primary scores + composite for a single listing.
 *
 * Pure function — deterministic, no I/O. The caller is responsible for
 * persisting the result (typically into `ListingScore`).
 *
 * The compositeScore is `Σ score × weight` where weights come from
 * `config.composite` and sum to 1.0 (validated at config-merge time).
 */
export function scoreListing(
  input: ScoringInput,
  config: ScoringConfig = DEFAULT_SCORING_CONFIG,
): ScoringResult {
  const match = scoreMatch(input, config);
  const renovation = scoreRenovation(input, config);
  const specialObject = scoreSpecialObject(input, config);
  const dataConfidence = scoreDataConfidence(input);
  const investment = scoreInvestment(input, config, dataConfidence.score);

  const w = config.composite;
  const composite = clamp(
    match.score * w.matchScore +
      renovation.score * w.renovationScore +
      specialObject.score * w.specialObjectScore +
      dataConfidence.score * w.dataConfidence +
      investment.score * w.investmentPotentialScore,
  );

  return {
    matchScore: match.score,
    renovationScore: renovation.score,
    specialObjectScore: specialObject.score,
    dataConfidence: dataConfidence.score,
    investmentPotentialScore: investment.score,
    compositeScore: Math.round(composite),
    components: {
      match: match.components,
      renovation: renovation.components,
      specialObject: specialObject.components,
      investment: investment.components,
      dataConfidence: dataConfidence.components,
    },
    scorerVersion: config.scorerVersion,
  };
}

export { makeScoringConfig, DEFAULT_SCORING_CONFIG };
export type { ScoringConfig };

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
