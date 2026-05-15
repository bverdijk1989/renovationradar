import type {
  Language,
  PropertyType,
  RenovationStatus,
  SpecialObjectType,
  TernaryFlag,
  UtilityStatus,
} from "@prisma/client";
import { detectLanguage } from "../detect-language";
import type {
  ExtractionResult,
  FieldExtraction,
  NormalizationExtractor,
  NormalizationInput,
} from "../types";
import {
  HECTARE_PATTERNS,
  PRICE_PATTERNS,
  ROOMS_PATTERNS,
  SQUARE_METER_PATTERNS,
  parseLocaleNumber,
} from "../wordlists/shared";
import { wordlistFor } from "../wordlists";

/**
 * Deterministic, rule-based extractor.
 *
 * Strategy:
 *   1. Resolve language: source hint > detector > "fr" fallback (most listings
 *      in the brief are FR).
 *   2. Pick the wordlist for that language.
 *   3. Run regex / keyword scans over `title + description`. Title matches
 *      get a confidence bonus because the title is curated by the source.
 *   4. Connector-parsed numeric fields (rawPrice, rawLandArea, …) bypass
 *      regex and are treated as confidence 1.0.
 *
 * The class is stateless aside from the wordlist lookup, so it's safe to
 * share across requests / workers.
 */
export class RuleBasedExtractor implements NormalizationExtractor {
  readonly name = "rule-based-v1";

  async extract(input: NormalizationInput): Promise<ExtractionResult> {
    const titleLc = (input.title ?? "").toLowerCase();
    const descLc = (input.description ?? "").toLowerCase();
    const combined = `${titleLc}\n${descLc}`.trim();

    // ----- Language ------------------------------------------------------
    const language = resolveLanguage(input, combined);
    const lang = language.value ?? "fr";
    const wl = wordlistFor(lang);

    // ----- Price ---------------------------------------------------------
    const priceEur = extractPrice(input, combined);

    // ----- Areas ---------------------------------------------------------
    const landAreaM2 = extractLandArea(input, combined);
    const livingAreaM2 = extractLivingArea(input, combined, lang);
    const rooms = extractRooms(input, combined);

    // ----- Property type & special object --------------------------------
    const propertyType = matchEnum<PropertyType>(combined, wl.propertyType, titleLc);
    const specialObjectType = matchEnum<SpecialObjectType>(
      combined,
      wl.specialObject,
      titleLc,
    );
    const isSpecialObject: FieldExtraction<boolean> = specialObjectType.value
      ? {
          value: true,
          confidence: specialObjectType.confidence,
          evidence: specialObjectType.evidence,
        }
      : { value: false, confidence: 0.4, evidence: "geen bijzonder-object trefwoord gevonden" };

    // ----- Detached ------------------------------------------------------
    const isDetached = extractDetached(combined, wl, titleLc);

    // ----- Renovation status ---------------------------------------------
    const renovationStatus = extractRenovation(combined, wl, titleLc);

    // ----- Utilities -----------------------------------------------------
    const electricityStatus = extractUtility(combined, wl.electricity, "stroom");
    const waterStatus = extractUtility(combined, wl.water, "water");

    return {
      language,
      priceEur,
      landAreaM2,
      livingAreaM2,
      rooms,
      propertyType,
      isDetached,
      renovationStatus,
      isSpecialObject,
      specialObjectType,
      electricityStatus,
      waterStatus,
    };
  }
}

// ---------------------------------------------------------------------------
// Language
// ---------------------------------------------------------------------------

function resolveLanguage(
  input: NormalizationInput,
  combined: string,
): FieldExtraction<Language> {
  if (input.languageHint) {
    return {
      value: input.languageHint,
      confidence: 0.95,
      evidence: `taal-hint van bron: ${input.languageHint}`,
    };
  }
  const detected = detectLanguage(combined);
  if (detected.value) return detected;
  // Last-resort: infer from country.
  const fromCountry =
    input.country === "FR" ? "fr" :
    input.country === "DE" ? "de" :
    input.country === "BE" ? "nl" : // NL is the more common dev case
    input.country === "NL" ? "nl" : null;
  if (fromCountry) {
    return {
      value: fromCountry,
      confidence: 0.4,
      evidence: `geen taal gedetecteerd, afgeleid uit land=${input.country}`,
    };
  }
  return { value: null, confidence: 0, evidence: "taal onbepaald" };
}

// ---------------------------------------------------------------------------
// Numeric extractors
// ---------------------------------------------------------------------------

function extractPrice(
  input: NormalizationInput,
  combined: string,
): FieldExtraction<number> {
  if (input.rawPrice != null) {
    const n = typeof input.rawPrice === "number"
      ? input.rawPrice
      : parseLocaleNumber(String(input.rawPrice));
    if (n != null && n > 0) {
      return {
        value: Math.round(n),
        confidence: 1.0,
        evidence: `prijs uit bronveld: ${input.rawPrice}`,
      };
    }
  }
  for (const re of PRICE_PATTERNS) {
    const m = combined.match(re);
    if (!m) continue;
    const n = parseLocaleNumber(m[1] ?? "");
    if (n != null && n >= 1000) {
      return {
        value: Math.round(n),
        confidence: 0.85,
        evidence: `prijs herkend in tekst: "${m[0]?.trim()}"`,
      };
    }
  }
  return { value: null, confidence: 0, evidence: "geen prijs gevonden" };
}

function extractLandArea(
  input: NormalizationInput,
  combined: string,
): FieldExtraction<number> {
  if (input.rawLandArea != null) {
    const n = typeof input.rawLandArea === "number"
      ? input.rawLandArea
      : parseLocaleNumber(String(input.rawLandArea));
    if (n != null && n > 0) {
      return {
        value: Math.round(n),
        confidence: 1.0,
        evidence: `grondoppervlak uit bronveld: ${input.rawLandArea} m²`,
      };
    }
  }
  // Try hectares first — clearer signal, less ambiguity than bare m².
  for (const re of HECTARE_PATTERNS) {
    const m = combined.match(re);
    if (!m) continue;
    const n = parseLocaleNumber(m[1] ?? "");
    if (n != null && n > 0) {
      return {
        value: Math.round(n * 10_000),
        confidence: 0.9,
        evidence: `grondoppervlak in hectaren herkend: "${m[0]?.trim()}" → ${Math.round(n * 10_000)} m²`,
      };
    }
  }
  // Then m². Avoid matching "Wohnfläche XX m²" / "surface habitable XX m²" /
  // "woonoppervlak XX m²" — those go to living-area extraction. Quick
  // heuristic: pick the LARGEST m² number, since land area is typically
  // ≫ living area.
  let best: { value: number; evidence: string } | null = null;
  for (const re of SQUARE_METER_PATTERNS) {
    const reg = new RegExp(re.source, re.flags.includes("g") ? re.flags : `g${re.flags}`);
    let m: RegExpExecArray | null;
    while ((m = reg.exec(combined)) !== null) {
      const n = parseLocaleNumber(m[1] ?? "");
      if (n != null && n >= 1000 && (best == null || n > best.value)) {
        best = { value: Math.round(n), evidence: `m² match: "${m[0]?.trim()}"` };
      }
    }
  }
  if (best) return { value: best.value, confidence: 0.7, evidence: best.evidence };
  return { value: null, confidence: 0, evidence: "geen grondoppervlak gevonden" };
}

function extractLivingArea(
  input: NormalizationInput,
  combined: string,
  language: Language,
): FieldExtraction<number> {
  if (input.rawLivingArea != null) {
    const n = typeof input.rawLivingArea === "number"
      ? input.rawLivingArea
      : parseLocaleNumber(String(input.rawLivingArea));
    if (n != null && n > 0) {
      return {
        value: Math.round(n),
        confidence: 1.0,
        evidence: `woonoppervlak uit bronveld: ${input.rawLivingArea} m²`,
      };
    }
  }
  // Per-language patterns: look for the LABEL → number near it.
  const PATTERNS: Record<Language, RegExp[]> = {
    fr: [
      /surface\s+habitable[^\d]{0,10}(\d[\d.,\s ]{0,7})\s*m\s*[²2]/i,
      /(\d[\d.,\s ]{0,7})\s*m\s*[²2]\s+habitable/i,
    ],
    nl: [
      /woonoppervlak[^\d]{0,10}(\d[\d.,\s ]{0,7})\s*m\s*[²2]/i,
      /bewoonbaar\s+(\d[\d.,\s ]{0,7})\s*m\s*[²2]/i,
    ],
    de: [
      /wohnfl[äa]che[^\d]{0,10}(\d[\d.,\s ]{0,7})\s*m\s*[²2]/i,
    ],
    en: [],
  };
  for (const re of PATTERNS[language]) {
    const m = combined.match(re);
    if (!m) continue;
    const n = parseLocaleNumber(m[1] ?? "");
    if (n != null && n >= 20 && n <= 2000) {
      return {
        value: Math.round(n),
        confidence: 0.85,
        evidence: `woonoppervlak herkend: "${m[0]?.trim()}"`,
      };
    }
  }
  return { value: null, confidence: 0, evidence: "geen woonoppervlak gevonden" };
}

function extractRooms(
  input: NormalizationInput,
  combined: string,
): FieldExtraction<number> {
  if (input.rawRooms != null) {
    const n = Number(input.rawRooms);
    if (Number.isFinite(n) && n > 0) {
      return { value: Math.round(n), confidence: 1.0, evidence: `kamers uit bronveld: ${n}` };
    }
  }
  for (const { regex } of ROOMS_PATTERNS) {
    const m = combined.match(regex);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0 && n < 50) {
      return {
        value: n,
        confidence: 0.8,
        evidence: `kamers herkend: "${m[0]?.trim()}"`,
      };
    }
  }
  return { value: null, confidence: 0, evidence: "geen kamertelling gevonden" };
}

// ---------------------------------------------------------------------------
// Enum extractors
// ---------------------------------------------------------------------------

function matchEnum<T extends string>(
  combined: string,
  table: Partial<Record<T, string[]>>,
  titleLc: string,
): FieldExtraction<T> {
  for (const [value, keywords] of Object.entries(table) as Array<[T, string[]]>) {
    for (const kw of keywords) {
      const k = kw.toLowerCase();
      if (combined.includes(k)) {
        const inTitle = titleLc.includes(k);
        return {
          value,
          confidence: inTitle ? 0.95 : 0.75,
          evidence: `trefwoord "${kw}" gevonden${inTitle ? " in titel" : " in tekst"}`,
        };
      }
    }
  }
  return { value: null, confidence: 0, evidence: "geen trefwoord gevonden" };
}

function extractDetached(
  combined: string,
  wl: { detached: { yes: string[]; no: string[] } },
  titleLc: string,
): FieldExtraction<TernaryFlag> {
  for (const kw of wl.detached.no) {
    const k = kw.toLowerCase();
    if (combined.includes(k)) {
      return {
        value: "no",
        confidence: titleLc.includes(k) ? 0.95 : 0.8,
        evidence: `niet-vrijstaand trefwoord: "${kw}"`,
      };
    }
  }
  for (const kw of wl.detached.yes) {
    const k = kw.toLowerCase();
    if (combined.includes(k)) {
      return {
        value: "yes",
        confidence: titleLc.includes(k) ? 0.95 : 0.8,
        evidence: `vrijstaand trefwoord: "${kw}"`,
      };
    }
  }
  return { value: "unknown", confidence: 0.3, evidence: "geen vrijstaand-signaal" };
}

function extractRenovation(
  combined: string,
  wl: { renovation: { ruin: string[]; needs_renovation: string[]; partial_renovation: string[]; move_in_ready: string[] } },
  titleLc: string,
): FieldExtraction<RenovationStatus> {
  // Order: ruin > needs > partial > ready. A "ruin" mention dominates "needs".
  const tiers: Array<[RenovationStatus, string[]]> = [
    ["ruin", wl.renovation.ruin],
    ["needs_renovation", wl.renovation.needs_renovation],
    ["partial_renovation", wl.renovation.partial_renovation],
    ["move_in_ready", wl.renovation.move_in_ready],
  ];
  for (const [status, keywords] of tiers) {
    for (const kw of keywords) {
      const k = kw.toLowerCase();
      if (combined.includes(k)) {
        return {
          value: status,
          confidence: titleLc.includes(k) ? 0.95 : 0.8,
          evidence: `renovatie-trefwoord: "${kw}"`,
        };
      }
    }
  }
  return { value: "unknown", confidence: 0.2, evidence: "geen renovatie-signaal" };
}

function extractUtility(
  combined: string,
  table: { present: string[]; likely: string[]; absent: string[] },
  utilityLabel: string,
): FieldExtraction<UtilityStatus> {
  for (const kw of table.absent) {
    if (combined.includes(kw.toLowerCase())) {
      return {
        value: "absent",
        confidence: 0.9,
        evidence: `${utilityLabel} afwezig-trefwoord: "${kw}"`,
      };
    }
  }
  for (const kw of table.present) {
    if (combined.includes(kw.toLowerCase())) {
      return {
        value: "present",
        confidence: 0.9,
        evidence: `${utilityLabel} aanwezig-trefwoord: "${kw}"`,
      };
    }
  }
  for (const kw of table.likely) {
    if (combined.includes(kw.toLowerCase())) {
      return {
        value: "likely",
        confidence: 0.5,
        evidence: `${utilityLabel} waarschijnlijk-trefwoord: "${kw}"`,
      };
    }
  }
  return { value: "unknown", confidence: 0.2, evidence: `geen ${utilityLabel}-signaal` };
}
