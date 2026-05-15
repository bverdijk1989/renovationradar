import type {
  Country,
  Language,
  PropertyType,
  RenovationStatus,
  SpecialObjectType,
  TernaryFlag,
  UtilityStatus,
} from "@prisma/client";

/**
 * Input the engine accepts. Connectors always populate `raw` (the source's
 * native payload) and SHOULD populate the flat fields when they parse them
 * cheaply — e.g. an RSS connector that already has a numeric price doesn't
 * need to re-discover it via regex. Anything missing on the flat side is
 * recovered from `title` + `description` by the extractors.
 */
export type NormalizationInput = {
  rawListingId?: string;
  sourceId: string;
  url: string;
  /** Hint from the source — e.g. RSS `<language>` tag. May be wrong. */
  languageHint?: Language | null;

  title: string;
  description?: string | null;

  /** Connector-parsed candidates. Engine treats them as "high confidence" hints. */
  rawPrice?: string | number | null;
  rawLandArea?: string | number | null;
  rawLivingArea?: string | number | null;
  rawRooms?: string | number | null;

  /** Address — usually known from the source. */
  country: Country;
  city?: string | null;
  region?: string | null;
  postalCode?: string | null;
  addressLine?: string | null;

  /** Photos / media — passed through verbatim by the engine. */
  media?: Array<{ url: string; caption?: string | null }>;

  /** Optional agency hint. */
  agencyName?: string | null;
};

// ---------------------------------------------------------------------------
// Field extraction primitive
// ---------------------------------------------------------------------------

/**
 * Every extraction returns a value + confidence + evidence. Confidence is
 * 0..1 (0 = no signal, 1 = explicit & unambiguous). Evidence is a
 * human-readable string that surfaces in the listing's `explanations`
 * dict — used by the UI's score breakdown and by debugging.
 */
export type FieldExtraction<T> = {
  value: T | null;
  confidence: number;
  evidence?: string;
};

export type ExtractionResult = {
  language: FieldExtraction<Language>;
  priceEur: FieldExtraction<number>;
  landAreaM2: FieldExtraction<number>;
  livingAreaM2: FieldExtraction<number>;
  rooms: FieldExtraction<number>;
  propertyType: FieldExtraction<PropertyType>;
  isDetached: FieldExtraction<TernaryFlag>;
  renovationStatus: FieldExtraction<RenovationStatus>;
  isSpecialObject: FieldExtraction<boolean>;
  specialObjectType: FieldExtraction<SpecialObjectType>;
  electricityStatus: FieldExtraction<UtilityStatus>;
  waterStatus: FieldExtraction<UtilityStatus>;
};

// ---------------------------------------------------------------------------
// Output: a draft NormalizedListing
// ---------------------------------------------------------------------------

export type NormalizationDraft = {
  sourceId: string;
  originalUrl: string;

  language: Language;
  titleOriginal: string;
  titleNl: string | null;
  descriptionOriginal: string | null;
  descriptionNl: string | null;

  priceEur: number | null;
  propertyType: PropertyType;
  renovationStatus: RenovationStatus;
  isSpecialObject: boolean;
  specialObjectType: SpecialObjectType | null;
  isDetached: TernaryFlag;

  landAreaM2: number | null;
  livingAreaM2: number | null;
  rooms: number | null;

  electricityStatus: UtilityStatus;
  waterStatus: UtilityStatus;

  country: Country;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  addressLine: string | null;

  media: Array<{ url: string; caption: string | null }>;

  /** 0..100 — feeds ListingScore.dataConfidence directly. */
  dataConfidence: number;

  /**
   * Field-level explanations. Keys are NormalizedListing column names;
   * values are short Dutch sentences. Surfaced in the score breakdown.
   */
  explanations: Record<string, string>;

  extractorName: string;
};

// ---------------------------------------------------------------------------
// Pluggable extractor interface
// ---------------------------------------------------------------------------

/**
 * The contract for any extractor implementation. The rule-based extractor
 * is the default; an LLM-backed one can be swapped in by name without
 * touching the engine orchestrator.
 */
export interface NormalizationExtractor {
  /** Stable identifier, written to NormalizedListing scorer logs. */
  readonly name: string;
  extract(input: NormalizationInput): Promise<ExtractionResult>;
}
