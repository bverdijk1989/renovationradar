import type {
  NormalizationDraft,
  NormalizationExtractor,
  NormalizationInput,
} from "./types";
import { RuleBasedExtractor } from "./extractors/rule-based";
import { aggregateConfidence } from "./confidence";
import { buildDescriptionNl, buildTitleNl } from "./translate";

const DEFAULT_EXTRACTOR = new RuleBasedExtractor();

/**
 * Normalize a raw listing into a NormalizationDraft.
 *
 * Deterministic for the default (rule-based) extractor — same input → same
 * output, no I/O, no time-dependent behaviour. Tests rely on this.
 *
 * To plug in the LLM extractor later, pass `{ extractor: new LlmExtractor() }`
 * or compose: run rule-based first, then LLM on low-confidence fields.
 */
export async function normalize(
  input: NormalizationInput,
  opts: { extractor?: NormalizationExtractor } = {},
): Promise<NormalizationDraft> {
  const extractor = opts.extractor ?? DEFAULT_EXTRACTOR;
  const result = await extractor.extract(input);

  // Resolve language with fallback for the draft itself (which has a
  // non-nullable language field).
  const language = result.language.value ?? "fr";

  const titleNl = buildTitleNl(input, result);
  const descriptionNl = buildDescriptionNl(input, language);

  const explanations: Record<string, string> = {
    language: result.language.evidence ?? "",
    priceEur: result.priceEur.evidence ?? "",
    landAreaM2: result.landAreaM2.evidence ?? "",
    livingAreaM2: result.livingAreaM2.evidence ?? "",
    rooms: result.rooms.evidence ?? "",
    propertyType: result.propertyType.evidence ?? "",
    isDetached: result.isDetached.evidence ?? "",
    renovationStatus: result.renovationStatus.evidence ?? "",
    isSpecialObject: result.isSpecialObject.evidence ?? "",
    specialObjectType: result.specialObjectType.evidence ?? "",
    electricityStatus: result.electricityStatus.evidence ?? "",
    waterStatus: result.waterStatus.evidence ?? "",
  };

  return {
    sourceId: input.sourceId,
    originalUrl: input.url,

    language,
    titleOriginal: input.title,
    titleNl,
    descriptionOriginal: input.description ?? null,
    descriptionNl,

    priceEur: result.priceEur.value,
    propertyType: result.propertyType.value ?? "unknown",
    renovationStatus: result.renovationStatus.value ?? "unknown",
    isSpecialObject: result.isSpecialObject.value ?? false,
    specialObjectType: result.specialObjectType.value,
    isDetached: result.isDetached.value ?? "unknown",

    landAreaM2: result.landAreaM2.value,
    livingAreaM2: result.livingAreaM2.value,
    rooms: result.rooms.value,

    electricityStatus: result.electricityStatus.value ?? "unknown",
    waterStatus: result.waterStatus.value ?? "unknown",

    country: input.country,
    city: input.city ?? null,
    region: input.region ?? null,
    postalCode: input.postalCode ?? null,
    addressLine: input.addressLine ?? null,

    media: (input.media ?? []).map((m) => ({ url: m.url, caption: m.caption ?? null })),

    dataConfidence: aggregateConfidence(result),
    explanations,
    extractorName: extractor.name,
  };
}
