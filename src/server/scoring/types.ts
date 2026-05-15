import type {
  Language,
  PropertyType,
  RenovationStatus,
  SpecialObjectType,
  TernaryFlag,
  UtilityStatus,
} from "@prisma/client";

/**
 * Everything the scoring engine needs to score one listing. Pulled from
 * a NormalizedListing + its 1:1 ListingLocation + (optional) free text
 * for keyword-based renovation scoring.
 */
export type ScoringInput = {
  priceEur: number | null;
  landAreaM2: number | null;
  livingAreaM2: number | null;

  propertyType: PropertyType;
  renovationStatus: RenovationStatus;
  isSpecialObject: boolean;
  specialObjectType: SpecialObjectType | null;
  isDetached: TernaryFlag;

  electricityStatus: UtilityStatus;
  waterStatus: UtilityStatus;

  language: Language;

  location: { distanceFromVenloKm: number | null } | null;

  /** Free text the renovation scorer scans for boost-keywords. */
  titleOriginal: string;
  titleNl?: string | null;
  descriptionOriginal?: string | null;
  descriptionNl?: string | null;

  /**
   * `dataConfidence` from the normalization step (0..100), if available.
   * If null, the engine computes a fallback from field populated-ness.
   */
  normalizationConfidence?: number | null;
};

/** A single explainable score line. */
export type ScoreComponent = {
  /** Stable id, e.g. "match.price.under_target". */
  id: string;
  /** Short Dutch label for the UI. */
  label: string;
  /** Points awarded (can be 0 or negative if a penalty fires). */
  points: number;
  /** Max possible for this component. */
  max: number;
  /** Why these points fired, in Dutch. */
  evidence: string;
};

/**
 * Output of the scoring engine. All scores are 0..100 (clamped). The
 * composite is the weighted average from `compositeWeights`.
 *
 * Component arrays are the explainable breakdown — surfaced in the UI
 * detail page's score-breakdown card.
 */
export type ScoringResult = {
  matchScore: number;
  renovationScore: number;
  specialObjectScore: number;
  dataConfidence: number;
  investmentPotentialScore: number;
  compositeScore: number;

  components: {
    match: ScoreComponent[];
    renovation: ScoreComponent[];
    specialObject: ScoreComponent[];
    investment: ScoreComponent[];
    dataConfidence: ScoreComponent[];
  };

  scorerVersion: string;
};
