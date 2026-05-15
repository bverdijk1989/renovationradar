import type {
  Language,
  PropertyType,
  SpecialObjectType,
} from "@prisma/client";

/**
 * Configurable scoring weights and targets. Every value has a sensible
 * default; pass a partial override to `scoreListing(input, config)` to
 * tune ranking without touching code.
 *
 * Point allocations for match_score come directly from the brief:
 *   price 20 · distance 15 · land 20 · detached 15 · electricity 10 ·
 *   water 5 · renovation 10 · special bonus 5  →  total 100.
 */
export type ScoringConfig = {
  /** Maximum points per match-score component. Sum = 100. */
  matchPoints: {
    price: number;
    distance: number;
    land: number;
    detached: number;
    electricity: number;
    water: number;
    renovation: number;
    specialBonus: number;
  };

  /**
   * Targets and linear-decay windows for the match-score continuous components.
   * Hitting the target gives full points; the decay window controls how
   * quickly points drop to 0 once the target is passed.
   */
  priceTargetEur: number;
  priceDecayEur: number;
  distanceTargetKm: number;
  distanceDecayKm: number;
  landTargetM2: number;
  /** Below the target, points scale linearly to 0 at landFloorM2. */
  landFloorM2: number;

  /**
   * Composite weights — how the 5 primary scores combine into compositeScore.
   * Must sum to 1.0.
   */
  composite: {
    matchScore: number;
    renovationScore: number;
    specialObjectScore: number;
    dataConfidence: number;
    investmentPotentialScore: number;
  };

  /**
   * Per-language renovation boost keywords. Each match in title or
   * description adds points to the renovation_score (capped). Phrases are
   * lowercase substrings; tested with case-insensitive `includes()`.
   */
  renovationKeywords: Record<Language, string[]>;

  /** Base scores per special-object type (0..100). */
  specialObjectBase: Record<SpecialObjectType, number>;

  /**
   * Heritage-property bonus: property types that aren't formally "special"
   * but still carry character / restoration appeal (old farmhouse, longère,
   * manor, mansion). Used by specialObjectScore as a secondary path so
   * "oude hoeve / oude boerderij" from the brief still surfaces.
   */
  heritagePropertyTypes: PropertyType[];
  heritagePropertyBonus: number;

  scorerVersion: string;
};

export const DEFAULT_SCORING_CONFIG: ScoringConfig = Object.freeze({
  matchPoints: {
    price: 20,
    distance: 15,
    land: 20,
    detached: 15,
    electricity: 10,
    water: 5,
    renovation: 10,
    specialBonus: 5,
  },
  priceTargetEur: 200_000,
  priceDecayEur: 100_000, // 200k = full; 300k = 0
  distanceTargetKm: 350,
  distanceDecayKm: 150,   // 350km = full; 500km = 0
  landTargetM2: 10_000,
  landFloorM2: 5_000,     // <5k = 0; 10k+ = full

  composite: {
    matchScore: 0.30,
    renovationScore: 0.15,
    specialObjectScore: 0.30,
    dataConfidence: 0.10,
    investmentPotentialScore: 0.15,
  },

  renovationKeywords: {
    fr: [
      "à rénover",
      "travaux à prévoir",
      "gros potentiel",
      "rénovation complète",
      "à restaurer",
      "gros oeuvre",
      "rénovation à prévoir",
    ],
    nl: [
      "te renoveren",
      "opknapwoning",
      "renovatiewoning",
      "casco",
      "klushuis",
      "opknapper",
      "achterstallig onderhoud",
    ],
    de: [
      "sanierungsbedürftig",
      "renovierungsbedürftig",
      "modernisierungsbedürftig",
      "sanierung erforderlich",
      "renovierung notwendig",
    ],
    en: [
      "renovation",
      "fixer upper",
      "needs work",
      "to restore",
    ],
  },

  specialObjectBase: {
    watermill: 100,
    lighthouse: 100,
    mill: 95,
    station_building: 90,
    lock_keeper_house: 90,
    level_crossing_house: 88,
    chapel: 80,
    monastery: 80,
    other: 70,
  },

  heritagePropertyTypes: ["farmhouse", "longere", "manor", "mansion"] satisfies PropertyType[],
  heritagePropertyBonus: 40,

  scorerVersion: "v2",
});

/**
 * Merge a partial override into the default config. Deep-merge for the
 * nested objects, shallow for the rest. Validates that composite weights
 * still sum to 1.0 (throws otherwise to fail loud rather than rank wrong).
 */
export function makeScoringConfig(
  override?: Partial<ScoringConfig>,
): ScoringConfig {
  if (!override) return DEFAULT_SCORING_CONFIG;
  const merged: ScoringConfig = {
    ...DEFAULT_SCORING_CONFIG,
    ...override,
    matchPoints: { ...DEFAULT_SCORING_CONFIG.matchPoints, ...(override.matchPoints ?? {}) },
    composite: { ...DEFAULT_SCORING_CONFIG.composite, ...(override.composite ?? {}) },
    renovationKeywords: {
      ...DEFAULT_SCORING_CONFIG.renovationKeywords,
      ...(override.renovationKeywords ?? {}),
    },
    specialObjectBase: {
      ...DEFAULT_SCORING_CONFIG.specialObjectBase,
      ...(override.specialObjectBase ?? {}),
    },
  };
  const weightSum = Object.values(merged.composite).reduce((a, b) => a + b, 0);
  if (Math.abs(weightSum - 1) > 1e-6) {
    throw new Error(
      `Composite weights must sum to 1.0 (got ${weightSum.toFixed(4)})`,
    );
  }
  return merged;
}
