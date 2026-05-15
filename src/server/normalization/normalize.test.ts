import { describe, it, expect } from "vitest";
import type { Country, Language } from "@prisma/client";
import { normalize } from "./engine";
import { detectLanguage } from "./detect-language";
import { RuleBasedExtractor } from "./extractors/rule-based";
import { LlmExtractor } from "./extractors/llm";
import { aggregateConfidence, FIELD_WEIGHTS } from "./confidence";
import { parseLocaleNumber } from "./wordlists/shared";
import type { NormalizationInput } from "./types";

function makeInput(over: Partial<NormalizationInput> = {}): NormalizationInput {
  return {
    sourceId: "src-1",
    url: "https://example.com/listing",
    title: "Maison à rénover",
    description: null,
    country: "FR",
    ...over,
  };
}

const extractor = new RuleBasedExtractor();

// =============================================================================
// 1. Language detection (5)
// =============================================================================

describe("detectLanguage", () => {
  it("detects French from function words", () => {
    const r = detectLanguage("Maison à rénover dans le Lorraine avec terrain.");
    expect(r.value).toBe<Language>("fr");
    expect(r.confidence).toBeGreaterThan(0.3);
  });

  it("detects Dutch from function words", () => {
    const r = detectLanguage("Vrijstaande woning met grond te koop in het buitengebied.");
    expect(r.value).toBe<Language>("nl");
  });

  it("detects German from function words", () => {
    const r = detectLanguage("Freistehendes Haus mit großem Grundstück in der Eifel.");
    expect(r.value).toBe<Language>("de");
  });

  it("returns null on empty text", () => {
    expect(detectLanguage("").value).toBeNull();
    expect(detectLanguage("   ").value).toBeNull();
  });

  it("returns null and confidence 0 when no function words match", () => {
    const r = detectLanguage("XYZ 12345 ABC");
    expect(r.value).toBeNull();
    expect(r.confidence).toBe(0);
  });
});

// =============================================================================
// 2. Price extraction (4)
// =============================================================================

describe("price extraction", () => {
  it("parses € prefix with locale separators", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Belle longère — € 145.000", country: "FR" }),
    );
    expect(r.priceEur.value).toBe(145_000);
    expect(r.priceEur.confidence).toBeGreaterThan(0.7);
  });

  it("parses suffix EUR", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Boerderij te koop 175 000 EUR", country: "BE", languageHint: "nl" }),
    );
    expect(r.priceEur.value).toBe(175_000);
  });

  it("prefers connector-parsed rawPrice over regex", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Bauernhaus 199.000 €",
        rawPrice: 195_000,
        country: "DE",
        languageHint: "de",
      }),
    );
    expect(r.priceEur.value).toBe(195_000);
    expect(r.priceEur.confidence).toBe(1.0);
    expect(r.priceEur.evidence).toMatch(/bronveld/);
  });

  it("returns null when no price is mentioned", async () => {
    const r = await extractor.extract(makeInput({ title: "Mooie hoeve" }));
    expect(r.priceEur.value).toBeNull();
    expect(r.priceEur.confidence).toBe(0);
  });
});

// =============================================================================
// 3. Land area extraction (5)
// =============================================================================

describe("land area", () => {
  it("parses hectares (FR) and converts to m²", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Longère sur 1,2 hectare", country: "FR" }),
    );
    expect(r.landAreaM2.value).toBe(12_000);
  });

  it("parses hectares (DE) variant 'ha'", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Bauernhaus mit 2 ha Grundstück",
        country: "DE",
        languageHint: "de",
      }),
    );
    expect(r.landAreaM2.value).toBe(20_000);
  });

  it("parses m² directly when ≥1000", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Hoeve met 13500 m² grond", country: "NL", languageHint: "nl" }),
    );
    expect(r.landAreaM2.value).toBe(13_500);
  });

  it("picks the LARGEST m² match (avoiding living area)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Boerderij",
        description: "Woonoppervlak 140 m². Perceel 18.000 m². Tuin 200 m².",
        country: "NL",
        languageHint: "nl",
      }),
    );
    expect(r.landAreaM2.value).toBe(18_000);
  });

  it("uses connector-provided rawLandArea when present (confidence 1.0)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Longère",
        rawLandArea: 12_500,
        country: "FR",
      }),
    );
    expect(r.landAreaM2.value).toBe(12_500);
    expect(r.landAreaM2.confidence).toBe(1.0);
  });
});

// =============================================================================
// 4. Living area + rooms (4)
// =============================================================================

describe("living area & rooms", () => {
  it("extracts French 'surface habitable'", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Longère",
        description: "Surface habitable 140 m², jardin 1 ha.",
        country: "FR",
      }),
    );
    expect(r.livingAreaM2.value).toBe(140);
  });

  it("extracts German 'Wohnfläche'", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Bauernhaus",
        description: "Wohnfläche 175 m², Grundstück 1,3 ha.",
        country: "DE",
        languageHint: "de",
      }),
    );
    expect(r.livingAreaM2.value).toBe(175);
  });

  it("extracts rooms in French", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Maison 5 pièces à rénover",
        country: "FR",
      }),
    );
    expect(r.rooms.value).toBe(5);
  });

  it("extracts rooms in German", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Bauernhaus mit 6 Zimmern",
        country: "DE",
        languageHint: "de",
      }),
    );
    expect(r.rooms.value).toBe(6);
  });
});

// =============================================================================
// 5. Special objects: one test per required type (7)
// =============================================================================

describe("special objects (brief: mill, watermill, lock_keeper_house, station, lighthouse, farm, rural estate)", () => {
  it("watermill (FR)", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Ancien moulin à eau à vendre", country: "FR" }),
    );
    expect(r.specialObjectType.value).toBe("watermill");
    expect(r.isSpecialObject.value).toBe(true);
  });

  it("watermill (DE)", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Historische Wassermühle zu verkaufen", country: "DE", languageHint: "de" }),
    );
    expect(r.specialObjectType.value).toBe("watermill");
  });

  it("mill / windmolen (NL)", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Windmolen te koop, te restaureren", country: "NL", languageHint: "nl" }),
    );
    expect(r.specialObjectType.value).toBe("mill");
  });

  it("lock_keeper_house (FR)", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Maison éclusière sur canal", country: "BE", languageHint: "fr" }),
    );
    expect(r.specialObjectType.value).toBe("lock_keeper_house");
  });

  it("station building (BE-NL)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Voormalig stationsgebouw te renoveren",
        country: "BE",
        languageHint: "nl",
      }),
    );
    expect(r.specialObjectType.value).toBe("station_building");
  });

  it("lighthouse (FR)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Ancienne maison de gardien de phare",
        country: "FR",
      }),
    );
    expect(r.specialObjectType.value).toBe("lighthouse");
  });

  it("farmhouse via property type (not special) — DE Bauernhaus", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Bauernhaus mit 1,3 ha, sanierungsbedürftig",
        country: "DE",
        languageHint: "de",
      }),
    );
    expect(r.propertyType.value).toBe("farmhouse");
    expect(r.isSpecialObject.value).toBe(false);
  });
});

// =============================================================================
// 6. Renovation status (4)
// =============================================================================

describe("renovation status", () => {
  it("ruin dominates over needs_renovation when both present", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Corps de ferme en ruine, à rénover entièrement",
        country: "FR",
      }),
    );
    expect(r.renovationStatus.value).toBe("ruin");
  });

  it("needs_renovation (NL)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Opknapwoning op 1,2 ha",
        country: "NL",
        languageHint: "nl",
      }),
    );
    expect(r.renovationStatus.value).toBe("needs_renovation");
  });

  it("partial_renovation (DE)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Wassermühle teilsaniert, neues Dach",
        country: "DE",
        languageHint: "de",
      }),
    );
    expect(r.renovationStatus.value).toBe("partial_renovation");
  });

  it("move_in_ready (FR)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Maison habitable, clé en main",
        country: "FR",
      }),
    );
    expect(r.renovationStatus.value).toBe("move_in_ready");
  });
});

// =============================================================================
// 7. Detached (3)
// =============================================================================

describe("detached", () => {
  it("yes: maison individuelle", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Maison individuelle à rénover", country: "FR" }),
    );
    expect(r.isDetached.value).toBe("yes");
  });

  it("no: mitoyenne (FR)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Maison mitoyenne",
        country: "FR",
      }),
    );
    expect(r.isDetached.value).toBe("no");
  });

  it("unknown when no signal", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Bien immobilier", country: "FR" }),
    );
    expect(r.isDetached.value).toBe("unknown");
  });
});

// =============================================================================
// 8. Utilities (4)
// =============================================================================

describe("utilities (electricity & water)", () => {
  it("electricity present (FR)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Longère",
        description: "Électricité raccordée, eau courante disponible.",
        country: "FR",
      }),
    );
    expect(r.electricityStatus.value).toBe("present");
    expect(r.waterStatus.value).toBe("present");
  });

  it("electricity absent (FR)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Cabane",
        description: "Hors réseau, sans eau ni électricité.",
        country: "FR",
      }),
    );
    expect(r.electricityStatus.value).toBe("absent");
    expect(r.waterStatus.value).toBe("absent");
  });

  it("water present (DE Brunnen)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Resthof",
        description: "Eigener Brunnen, Stromanschluss vorhanden.",
        country: "DE",
        languageHint: "de",
      }),
    );
    expect(r.waterStatus.value).toBe("present");
    expect(r.electricityStatus.value).toBe("present");
  });

  it("unknown when nothing said", async () => {
    const r = await extractor.extract(
      makeInput({ title: "Boerderij", country: "NL", languageHint: "nl" }),
    );
    expect(r.electricityStatus.value).toBe("unknown");
    expect(r.waterStatus.value).toBe("unknown");
  });
});

// =============================================================================
// 9. End-to-end full normalize() (5)
// =============================================================================

describe("normalize() end-to-end", () => {
  it("FR watermill listing produces a complete draft with high confidence", async () => {
    const draft = await normalize(
      makeInput({
        title: "Ancien moulin à eau, 1,8 ha, 185.000 €",
        description:
          "Moulin du XVIIIᵉ partiellement rénové. Toiture neuve. Électricité raccordée. Cours d'eau privé.",
        country: "FR",
      }),
    );
    expect(draft.language).toBe<Language>("fr");
    expect(draft.priceEur).toBe(185_000);
    expect(draft.landAreaM2).toBe(18_000);
    expect(draft.specialObjectType).toBe("watermill");
    expect(draft.isSpecialObject).toBe(true);
    expect(draft.renovationStatus).toBe("partial_renovation");
    expect(draft.electricityStatus).toBe("present");
    expect(draft.waterStatus).toBe("present");
    expect(draft.dataConfidence).toBeGreaterThanOrEqual(60);
    // Title summary should be NL.
    expect(draft.titleNl).toMatch(/Watermolen/);
    expect(draft.titleNl).toMatch(/1,8 ha/);
  });

  it("NL farmhouse listing keeps the original title verbatim", async () => {
    const draft = await normalize(
      makeInput({
        title: "Vrijstaande hoeve te renoveren — 1,15 ha",
        description: "Stroom en water aanwezig.",
        country: "BE",
        languageHint: "nl",
      }),
    );
    expect(draft.language).toBe<Language>("nl");
    expect(draft.titleNl).toBe(draft.titleOriginal);
    expect(draft.propertyType).toBe("farmhouse");
    expect(draft.isDetached).toBe("yes");
    expect(draft.renovationStatus).toBe("needs_renovation");
  });

  it("DE Resthof translated into a Dutch summary", async () => {
    const draft = await normalize(
      makeInput({
        title: "Resthof in Alleinlage, 2,2 ha, sanierungsbedürftig",
        description: "Wohnfläche 150 m². Stromanschluss vorhanden.",
        country: "DE",
        languageHint: "de",
      }),
    );
    expect(draft.titleNl).toMatch(/Boerderij|Resthof|woning/i);
    expect(draft.descriptionNl).not.toBe(draft.descriptionOriginal);
  });

  it("explanations are populated for every primary field", async () => {
    const draft = await normalize(
      makeInput({
        title: "Bauernhaus zu verkaufen 195.000 €, freistehend, 1,3 ha",
        country: "DE",
        languageHint: "de",
      }),
    );
    for (const key of [
      "language",
      "priceEur",
      "landAreaM2",
      "propertyType",
      "isDetached",
      "renovationStatus",
      "electricityStatus",
      "waterStatus",
    ]) {
      expect(draft.explanations[key]).toBeTruthy();
    }
  });

  it("missing data → low dataConfidence + sensible defaults", async () => {
    const draft = await normalize(
      makeInput({
        title: "Onroerend goed",
        country: "NL",
        languageHint: "nl",
      }),
    );
    expect(draft.priceEur).toBeNull();
    expect(draft.landAreaM2).toBeNull();
    expect(draft.propertyType).toBe("unknown");
    expect(draft.renovationStatus).toBe("unknown");
    expect(draft.dataConfidence).toBeLessThan(30);
  });
});

// =============================================================================
// 10. Confidence aggregation (3)
// =============================================================================

describe("confidence aggregation", () => {
  it("weights sum to 1.0", () => {
    const sum = Object.values(FIELD_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1.0, 9);
  });

  it("all-present-with-confidence-1 → 100", () => {
    const fake = Object.fromEntries(
      Object.keys(FIELD_WEIGHTS).map((k) => [k, { value: 1, confidence: 1 }]),
    ) as never;
    expect(aggregateConfidence(fake)).toBe(100);
  });

  it("all-null → 0", () => {
    const fake = Object.fromEntries(
      Object.keys(FIELD_WEIGHTS).map((k) => [k, { value: null, confidence: 0.7 }]),
    ) as never;
    expect(aggregateConfidence(fake)).toBe(0);
  });
});

// =============================================================================
// 11. Deterministic & helpers (3)
// =============================================================================

describe("determinism and helpers", () => {
  it("normalize() is deterministic: same input → identical output", async () => {
    const input = makeInput({
      title: "Moulin à eau, 1,5 ha, 175.000 €",
      country: "FR",
    });
    const [a, b] = await Promise.all([normalize(input), normalize(input)]);
    // Strip the unique nondeterministic fields (none in v1) and compare.
    expect(a).toEqual(b);
  });

  it("LlmExtractor stub throws — interface visible but not implemented", async () => {
    await expect(new LlmExtractor().extract(makeInput())).rejects.toThrow(
      /placeholder for fase 5/i,
    );
  });

  it("parseLocaleNumber handles FR/NL/DE separators", () => {
    expect(parseLocaleNumber("350.000")).toBe(350_000);
    expect(parseLocaleNumber("350 000")).toBe(350_000);
    expect(parseLocaleNumber("350,000")).toBe(350_000);
    expect(parseLocaleNumber("1.250,50")).toBe(1_250.5);
    expect(parseLocaleNumber("1,5")).toBe(1.5);
    expect(parseLocaleNumber("abc")).toBeNull();
  });
});

// =============================================================================
// 12. Edge cases (3)
// =============================================================================

describe("edge cases", () => {
  it("ignores prices < €1000 (probably a per-month figure)", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Maison à louer 850 € / mois",
        country: "FR",
      }),
    );
    expect(r.priceEur.value).toBeNull();
  });

  it("language hint wins over conflicting detection", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Maison à rénover dans le Lorraine",
        languageHint: "de", // intentionally wrong
        country: "FR",
      }),
    );
    expect(r.language.value).toBe<Language>("de");
    expect(r.language.confidence).toBeGreaterThan(0.9);
  });

  it("country-based language fallback when no text + no hint", async () => {
    const r = await extractor.extract(
      makeInput({
        title: "Bien", // no function words
        country: "DE" as Country,
      }),
    );
    expect(r.language.value).toBe<Language>("de");
  });
});
