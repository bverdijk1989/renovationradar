# Normalization Engine

Translates a `RawListing` (source-specific payload + free-text fields) into a
`NormalizationDraft` (the shape that becomes a `NormalizedListing` row).

> Status fase 4: rule-based extractor live and tested. LLM extractor stub in
> place. Engine API is final — swapping extractors is one constructor change.

---

## Architecture

```
                                    ┌──────────────────────────┐
                                    │  NormalizationExtractor  │  ← interface
                                    └──────────┬───────────────┘
                                               │
                ┌──────────────────────────────┼──────────────────────────────┐
                │                              │                              │
        ┌───────▼─────────┐         ┌──────────▼──────────┐         ┌────────▼─────────┐
        │ RuleBasedV1     │         │ LlmExtractor (stub) │   →     │ Hybrid (fase 5+) │
        │ pure functions  │         │ throws NotImpl      │         │ rules + LLM-fill │
        └─────────────────┘         └─────────────────────┘         └──────────────────┘

      ┌──────────────────┐
      │ normalize(input) │  ← public API in src/server/normalization/engine.ts
      └─────────┬────────┘
                │
                ▼
        ExtractionResult ──► NormalizationDraft
        per-field {value,                      ▲
        confidence, evidence}                  │
                                ┌──────────────┴──────────────┐
                                │ aggregateConfidence()       │
                                │ buildTitleNl() / DescNl()   │
                                │ explanations dict           │
                                └─────────────────────────────┘
```

### Files

| File | Role |
| --- | --- |
| `types.ts` | `NormalizationInput`, `NormalizationDraft`, `FieldExtraction<T>`, `ExtractionResult`, `NormalizationExtractor` interface |
| `engine.ts` | `normalize(input, { extractor? })` — orchestrator |
| `detect-language.ts` | Function-word matching against FR/NL/DE lists |
| `extractors/rule-based.ts` | The deterministic, default extractor |
| `extractors/llm.ts` | Stub. Throws `not implemented`. Interface complete. |
| `wordlists/{fr,nl,de}.ts` | Per-language keyword tables (property type, renovation, detached, utilities, NL-translation hints) |
| `wordlists/shared.ts` | Regex patterns for price, hectares, m², rooms; `parseLocaleNumber()` |
| `confidence.ts` | `aggregateConfidence()` + per-field weights summing to 1.0 |
| `translate.ts` | Rule-based NL title summary + description hint replacements |
| `normalize.test.ts` | 50+ deterministic test cases |

---

## Extractor interface

```ts
export interface NormalizationExtractor {
  readonly name: string;
  extract(input: NormalizationInput): Promise<ExtractionResult>;
}
```

Every primitive field in `ExtractionResult` is a `FieldExtraction<T>`:

```ts
type FieldExtraction<T> = {
  value: T | null;
  confidence: number;   // 0..1
  evidence?: string;    // human-readable, surfaces in explanations
};
```

This forces every extractor — rule-based, LLM, hybrid — to produce both a
value AND a justification, which feeds the dashboard's score-breakdown UI.

### Plug in an LLM extractor

```ts
import { normalize } from "@/server/normalization";
import { LlmExtractor } from "@/server/normalization/extractors/llm";

await normalize(input, { extractor: new LlmExtractor() });
```

A hybrid extractor — recommended composition — runs the rule-based first
and only invokes the LLM for fields where confidence < 0.5. Single LLM
call, single round-trip, low cost.

---

## Rule-based decisions

### Language
1. If `languageHint` is set (RSS feed `<language>`, JSON-LD `inLanguage`, …),
   trust it (confidence 0.95).
2. Otherwise count matches per language against the function-word list.
3. If no list matches at all, fall back to country → language mapping
   (FR → fr, DE → de, BE/NL → nl). Confidence ≈ 0.4.

### Numeric fields (price, land area, living area, rooms)
1. Connector-parsed `rawX` values bypass regex (confidence 1.0).
2. Land area: hectares first (`1,2 ha` → 12 000 m²), then take the
   LARGEST m² match to avoid mistaking living-area for land.
3. Living area: per-language label patterns (`surface habitable`,
   `Wohnfläche`, `woonoppervlak`).
4. `parseLocaleNumber()` handles FR/NL/DE thousand/decimal separators
   uniformly: `350.000`, `350 000`, `350,000` all → 350 000.

### Property type & special objects
Wordlists are checked in **order**: most specific phrases first
(`moulin à eau` matches BEFORE `moulin`). The first hit wins. A match
in the title gets confidence 0.95; in the description 0.75.

Special objects (mill / watermill / lock_keeper_house / station_building /
lighthouse / chapel / monastery / level_crossing_house) live in a separate
table from property type. A "watermill" listing has property_type=watermill
AND is_special_object=true with special_object_type=watermill.

### Renovation status
Strict ordering: `ruin` > `needs_renovation` > `partial_renovation`
> `move_in_ready`. Ruin keywords win over "needs renovation" when both
appear in the same listing (a ruin is by definition a renovation case
but the more severe label is more informative).

### Detached
"No" signals (mitoyenne, Reihenhaus, rijwoning, appartement) are checked
BEFORE "yes" signals — explicitly disqualifying a listing is more reliable
than a positive signal like "freistehend".

### Utilities
For each utility independently: scan `absent` → `present` → `likely`.
Returns `unknown` (confidence 0.2) when no signal is found, so the
front-end can show "?" instead of a wrong claim.

---

## Confidence aggregation

`dataConfidence` (0..100) is a weighted average of per-field confidences.
Weights from `confidence.ts`:

| Field | Weight |
| --- | -: |
| priceEur | 0.20 |
| landAreaM2 | 0.18 |
| propertyType | 0.12 |
| isDetached | 0.10 |
| renovationStatus | 0.10 |
| isSpecialObject | 0.07 |
| livingAreaM2 | 0.05 |
| language | 0.05 |
| electricityStatus | 0.04 |
| specialObjectType | 0.03 |
| rooms | 0.03 |
| waterStatus | 0.03 |
| **Total** | **1.00** |

A listing where every field is found with confidence 1.0 scores 100;
all-null scores 0. The value drops straight into
`ListingScore.dataConfidence` — no extra scaling needed.

---

## Translation (rule-based)

`titleNl`:
- If source language is NL → copy verbatim.
- Otherwise → build a structured Dutch summary from extracted facts:
  ```
  Watermolen (gedeeltelijk gerenoveerd) 1,8 ha — Monthermé, Frankrijk
  ```
  Always-correct, always-Dutch, deterministic. Tests pin specific outputs.

`descriptionNl`:
- If source language is NL → copy verbatim.
- Otherwise → apply per-language phrase replacements
  (`moulin à eau` → `watermolen`, `Wassermühle` → `watermolen`, etc.).
- If no replacements fire → return `null` (the UI shows the original).
  Returning a near-identical copy would lie about being "translated".

The LLM extractor's job (fase 5+) is to do real prose translation when
this falls short. The schema column is unchanged either way.

---

## Determinism contract

For the rule-based extractor, `normalize(input)` is a **pure function**:

- No I/O (no DB, no network).
- No `Date.now()`, no `Math.random()`.
- No environment reads.
- Same input bytes → identical output bytes.

The test `normalize() is deterministic` pins this via `Promise.all([normalize(x), normalize(x)])`
and `expect(a).toEqual(b)`.

The LLM extractor breaks this guarantee — the engine documents that and
explicitly tags the extractor name (e.g. `llm-v1-gpt5o-mini`) on every
draft via `extractorName`. Reproduction relies on the model version
being captured.

---

## Test coverage

`normalize.test.ts` ships **50+ scenarios** across:

| Group | Tests |
| --- | -: |
| Language detection | 5 |
| Price extraction | 4 |
| Land area | 5 |
| Living area & rooms | 4 |
| Special objects (mill/watermill/lock_keeper/station/lighthouse/farm) | 7 |
| Renovation status | 4 |
| Detached | 3 |
| Utilities | 4 |
| End-to-end `normalize()` | 5 |
| Confidence aggregation | 3 |
| Determinism + helpers | 3 |
| Edge cases | 3 |

Run:

```powershell
pnpm test src/server/normalization
```
