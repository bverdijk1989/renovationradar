import type { Language } from "@prisma/client";
import { wordlistFor } from "./wordlists";
import {
  COUNTRY_LABELS,
  PROPERTY_TYPE_LABELS,
  RENOVATION_STATUS_LABELS,
  SPECIAL_OBJECT_LABELS,
} from "@/lib/format";
import type { ExtractionResult, NormalizationInput } from "./types";

/**
 * Rule-based "translation" — really a structured Dutch summary built from
 * the extracted facts. Deterministic, always correct (because it's derived
 * from values we ourselves parsed), and unambiguously NL.
 *
 * When the source is already NL we copy the title verbatim instead. The LLM
 * extractor (fase 5+) will replace this with a real translation.
 */
export function buildTitleNl(
  input: NormalizationInput,
  result: ExtractionResult,
): string {
  if (result.language.value === "nl") return input.title;

  const parts: string[] = [];

  // Lead with special-object type or property type.
  if (result.isSpecialObject.value && result.specialObjectType.value) {
    parts.push(SPECIAL_OBJECT_LABELS[result.specialObjectType.value] ?? "Bijzonder object");
  } else if (result.propertyType.value && result.propertyType.value !== "unknown") {
    parts.push(PROPERTY_TYPE_LABELS[result.propertyType.value] ?? "Woning");
  } else {
    parts.push("Woning");
  }

  // Renovation status as adjective.
  if (
    result.renovationStatus.value &&
    result.renovationStatus.value !== "unknown" &&
    result.renovationStatus.value !== "move_in_ready"
  ) {
    const label = RENOVATION_STATUS_LABELS[result.renovationStatus.value];
    if (label) parts.push(`(${label.toLowerCase()})`);
  }

  // Land area.
  if (result.landAreaM2.value && result.landAreaM2.value >= 10_000) {
    const ha = (result.landAreaM2.value / 10_000).toFixed(1).replace(".", ",");
    parts.push(`${ha} ha`);
  }

  // Location.
  const loc = [input.city, COUNTRY_LABELS[input.country]].filter(Boolean).join(", ");
  if (loc) parts.push(`— ${loc}`);

  return parts.join(" ");
}

/**
 * Rule-based pass for the description. Applies known phrase replacements
 * from the source language's wordlist (e.g. "moulin à eau" → "watermolen").
 * Output is a partial translation — clearly a hint, not a polished
 * translation. We leave it `null` if we can't materially improve on the
 * original, so the UI knows to surface the original.
 */
export function buildDescriptionNl(
  input: NormalizationInput,
  language: Language,
): string | null {
  if (!input.description) return null;
  if (language === "nl") return input.description;

  const wl = wordlistFor(language);
  let out = input.description;
  let replacements = 0;
  for (const [pattern, replacement] of wl.nlTranslationHints) {
    if (pattern.test(out)) {
      out = out.replace(pattern, replacement);
      replacements++;
    }
  }
  // If no replacements happened, the "translation" would just be the
  // original copy. Returning null is more honest — the UI shows the
  // original with a "translation pending" affordance.
  return replacements > 0 ? out : null;
}
