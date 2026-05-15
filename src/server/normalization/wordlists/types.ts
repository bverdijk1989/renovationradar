import type { PropertyType, SpecialObjectType } from "@prisma/client";

/**
 * Shape of a language-specific wordlist. Each entry maps an enum value to a
 * list of case-insensitive lowercase keywords / phrases that imply that
 * value when found in title or description.
 *
 * Property-type and special-object-type lists are checked in order; the
 * first match wins, so put the more specific phrases (e.g. "moulin à eau")
 * BEFORE the more generic ones ("moulin").
 */
export type LanguageWordlist = {
  /** Function words used for language detection. */
  functionWords: string[];

  /** "X" → keywords that imply property type X. */
  propertyType: Partial<Record<PropertyType, string[]>>;

  /** Keywords that flip is_special_object=true with the matching type. */
  specialObject: Partial<Record<SpecialObjectType, string[]>>;

  renovation: {
    ruin: string[];
    needs_renovation: string[];
    partial_renovation: string[];
    move_in_ready: string[];
  };

  detached: {
    yes: string[];
    no: string[];
  };

  electricity: {
    present: string[];
    likely: string[];
    absent: string[];
  };

  water: {
    present: string[];
    likely: string[];
    absent: string[];
  };

  /** Used by the rule-based Dutch translator. Maps source phrase → NL phrase. */
  nlTranslationHints: Array<[RegExp, string]>;
};
