import type { ScoringConfig } from "./config";
import type { ScoreComponent, ScoringInput } from "./types";

/**
 * renovation_score (0..100): how much "renovation opportunity" does this
 * listing represent? Combines:
 *   1. The renovationStatus enum (the structured signal).
 *   2. Per-language keyword hits in title + description (the textual signal).
 *
 * Keywords let us boost listings where the seller explicitly markets
 * "gros potentiel" / "casco" / "modernisierungsbedürftig" even if the
 * normalised enum is conservative.
 */
export function scoreRenovation(
  input: ScoringInput,
  config: ScoringConfig,
): { score: number; components: ScoreComponent[] } {
  const components: ScoreComponent[] = [];

  // -------- Base from enum -------------------------------------------------
  const base = enumBase(input.renovationStatus);
  components.push({
    id: `renovation.status.${input.renovationStatus}`,
    label: `Renovatiestatus: ${dutchStatus(input.renovationStatus)}`,
    points: base,
    max: 100,
    evidence: `enum-waarde → ${base} pt`,
  });

  // -------- Keyword bonuses ------------------------------------------------
  const text = combinedText(input).toLowerCase();
  const keywords = config.renovationKeywords[input.language] ?? [];
  const seen = new Set<string>();
  let bonus = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      const fresh = !seen.has(kw);
      if (fresh) {
        seen.add(kw);
        bonus += 5;
      }
    }
  }
  if (seen.size > 0) {
    // Cap the bonus so a single listing with 5 hits doesn't go to absurd numbers.
    const capped = Math.min(15, bonus);
    components.push({
      id: "renovation.keyword_bonus",
      label: "Renovatie-trefwoorden",
      points: capped,
      max: 15,
      evidence: `${seen.size} match${seen.size === 1 ? "" : "es"}: ${[...seen].join(", ")}`,
    });
  } else {
    components.push({
      id: "renovation.keyword_bonus",
      label: "Renovatie-trefwoorden",
      points: 0,
      max: 15,
      evidence: "geen renovatie-trefwoorden gevonden",
    });
  }

  const total = components.reduce((s, c) => s + c.points, 0);
  return { score: clamp(total), components };
}

function enumBase(status: ScoringInput["renovationStatus"]): number {
  switch (status) {
    case "ruin":
      return 95;
    case "needs_renovation":
      return 85;
    case "partial_renovation":
      return 60;
    case "move_in_ready":
      return 30;
    case "unknown":
      return 50;
  }
}

function dutchStatus(status: ScoringInput["renovationStatus"]): string {
  switch (status) {
    case "ruin":
      return "ruïne";
    case "needs_renovation":
      return "te renoveren";
    case "partial_renovation":
      return "gedeeltelijk gerenoveerd";
    case "move_in_ready":
      return "instapklaar";
    case "unknown":
      return "onbekend";
  }
}

function combinedText(input: ScoringInput): string {
  return [
    input.titleOriginal,
    input.titleNl ?? "",
    input.descriptionOriginal ?? "",
    input.descriptionNl ?? "",
  ].join("\n");
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
