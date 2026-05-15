import type { Language } from "@prisma/client";
import { FR, NL, DE } from "./wordlists";
import type { FieldExtraction } from "./types";

/**
 * Detects language by counting matches against a small function-word list
 * per language. Returns the language with the most distinctive matches.
 *
 * Algorithm:
 *   1. Tokenize the input into lowercase words.
 *   2. For each candidate language, count tokens that appear in its
 *      function-word list.
 *   3. Confidence = (winner_matches - runner_up_matches) / total_word_count,
 *      clamped to [0, 1]. A clear winner gets near-1 confidence; a near-tie
 *      gets low confidence.
 *
 * Deterministic and side-effect-free. If the source already provided a
 * `languageHint`, the caller may bypass this — see engine.ts.
 */
export function detectLanguage(text: string): FieldExtraction<Language> {
  if (!text || !text.trim()) {
    return { value: null, confidence: 0, evidence: "lege tekst" };
  }

  const tokens = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\-\s]/gu, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    return { value: null, confidence: 0, evidence: "geen tokens" };
  }

  const sets = {
    fr: new Set(FR.functionWords),
    nl: new Set(NL.functionWords),
    de: new Set(DE.functionWords),
  } as const;

  const counts: Record<Language, number> = { fr: 0, nl: 0, de: 0, en: 0 };
  for (const tok of tokens) {
    if (sets.fr.has(tok)) counts.fr += 1;
    if (sets.nl.has(tok)) counts.nl += 1;
    if (sets.de.has(tok)) counts.de += 1;
  }

  const entries = (Object.entries(counts) as Array<[Language, number]>)
    .filter(([lang]) => lang !== "en")
    .sort((a, b) => b[1] - a[1]);
  const [winner, runnerUp] = entries;

  if (!winner || winner[1] === 0) {
    // No distinctive function words → assume the source's hint was meaningful
    // but we can't verify. Caller will fall back to the hint or default.
    return {
      value: null,
      confidence: 0,
      evidence: "geen woorden uit FR/NL/DE function-word lijsten gevonden",
    };
  }

  const total = tokens.length;
  const gap = winner[1] - (runnerUp ? runnerUp[1] : 0);
  // Confidence is a function of both the gap AND the absolute count. A long
  // text with 1 vs 0 matches isn't very confident; a short text with 5 vs 0
  // is. We balance both.
  const gapConfidence = Math.min(1, gap / Math.max(3, total * 0.1));
  const absoluteConfidence = Math.min(1, winner[1] / 4);
  const confidence = Math.max(0.15, gapConfidence * 0.6 + absoluteConfidence * 0.4);

  return {
    value: winner[0],
    confidence,
    evidence: `${winner[0]}: ${winner[1]} function-words${runnerUp ? ` vs ${runnerUp[0]}: ${runnerUp[1]}` : ""}`,
  };
}
