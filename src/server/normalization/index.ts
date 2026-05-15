export { normalize } from "./engine";
export { RuleBasedExtractor } from "./extractors/rule-based";
export { LlmExtractor } from "./extractors/llm";
export { detectLanguage } from "./detect-language";
export { aggregateConfidence, FIELD_WEIGHTS } from "./confidence";
export type {
  NormalizationInput,
  NormalizationDraft,
  NormalizationExtractor,
  ExtractionResult,
  FieldExtraction,
} from "./types";
