import type {
  ExtractionResult,
  NormalizationExtractor,
  NormalizationInput,
} from "../types";

/**
 * Placeholder for the LLM-backed extractor.
 *
 * The interface is finalized in fase 4 so the wiring in `engine.ts` and the
 * connector framework can target it without changes. The actual call to the
 * LLM (prompt design, model selection, prompt caching, response parsing)
 * lives in fase 5+.
 *
 * Recommended composition once implemented: run the rule-based extractor
 * first, then feed its output PLUS the original text to the LLM with a
 * prompt like "Correct or fill in only fields where confidence < 0.5".
 * That keeps cost low and pins reproducibility for the easy cases.
 */
export class LlmExtractor implements NormalizationExtractor {
  readonly name = "llm-v0-stub";

  async extract(_input: NormalizationInput): Promise<ExtractionResult> {
    throw new Error(
      "LlmExtractor is a placeholder for fase 5+. Use RuleBasedExtractor or a hybrid that defers low-confidence fields to an LLM.",
    );
  }
}
