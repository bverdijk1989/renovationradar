import { SPECIAL_OBJECT_LABELS, PROPERTY_TYPE_LABELS, label } from "@/lib/format";
import type { ScoringConfig } from "./config";
import type { ScoreComponent, ScoringInput } from "./types";

/**
 * special_object_score (0..100): rewards the rare-object types from the
 * brief — molens, watermolens, stations, sluiswachtershuizen, vuurtorens,
 * plus "heritage" property types like oude boerderij / longère / manor.
 *
 *   - Formal special-object types use `specialObjectBase[type]` (typically
 *     80-100).
 *   - Heritage property types (farmhouse, longere, manor, mansion) get
 *     `heritagePropertyBonus` (default 40) when not flagged as special.
 *   - Everything else: 0.
 */
export function scoreSpecialObject(
  input: ScoringInput,
  config: ScoringConfig,
): { score: number; components: ScoreComponent[] } {
  const components: ScoreComponent[] = [];

  if (input.isSpecialObject && input.specialObjectType) {
    const base = config.specialObjectBase[input.specialObjectType];
    components.push({
      id: `special.type.${input.specialObjectType}`,
      label: `Bijzonder object: ${label(SPECIAL_OBJECT_LABELS, input.specialObjectType)}`,
      points: base,
      max: 100,
      evidence: `specialObjectType=${input.specialObjectType} → ${base} pt`,
    });
    return { score: clamp(base), components };
  }

  if (input.isSpecialObject && !input.specialObjectType) {
    components.push({
      id: "special.unspecified",
      label: "Bijzonder object (type onbekend)",
      points: 70,
      max: 100,
      evidence: "isSpecialObject=true zonder specifiek type → 70 pt",
    });
    return { score: 70, components };
  }

  if (config.heritagePropertyTypes.includes(input.propertyType)) {
    components.push({
      id: `special.heritage.${input.propertyType}`,
      label: `Karakteristiek: ${label(PROPERTY_TYPE_LABELS, input.propertyType)}`,
      points: config.heritagePropertyBonus,
      max: 100,
      evidence: `propertyType=${input.propertyType} (heritage) → ${config.heritagePropertyBonus} pt`,
    });
    return {
      score: clamp(config.heritagePropertyBonus),
      components,
    };
  }

  components.push({
    id: "special.none",
    label: "Geen bijzonder object",
    points: 0,
    max: 100,
    evidence: "isSpecialObject=false en geen heritage propertyType",
  });
  return { score: 0, components };
}

function clamp(n: number): number {
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
