# Scoring Engine

Produces 5 primary scores + 1 composite per listing, with full per-component
explainability. All scores are clamped 0..100.

> Pure function — `scoreListing(input, config?)` has no I/O and is fully
> deterministic. The service layer (`src/server/services/scoring.ts`) wraps
> it for DB persistence + the `/api/listings/:id/score` and
> `/api/scoring/recalculate` endpoints.

---

## Module layout

```
src/server/scoring/
├── types.ts            # ScoringInput, ScoringResult, ScoreComponent
├── config.ts           # ScoringConfig + DEFAULT_SCORING_CONFIG + makeScoringConfig()
├── match.ts            # 8-component match_score
├── renovation.ts       # enum base + per-language keyword bonus
├── special.ts          # type-based + heritage bonus for old farmhouses
├── data-confidence.ts  # passes through normalization confidence or fallback
├── investment.ts       # 6-factor investment_potential_score
├── engine.ts           # public scoreListing()
├── index.ts            # barrel
└── *.test.ts           # 47 tests
```

The brief's 5 scores map 1:1 to module files:

| Brief | Module |
| --- | --- |
| `match_score` | `match.ts` |
| `renovation_score` | `renovation.ts` |
| `special_object_score` | `special.ts` |
| `data_confidence` | `data-confidence.ts` |
| `investment_potential_score` | `investment.ts` |

---

## Match score (max 100, 8 components from the brief)

| Component | Max | Logic |
| --- | -: | --- |
| Prijs ≤ €200k | 20 | Full at ≤ target. Linear decay over €100k (€300k → 0). |
| Afstand ≤ 350 km | 15 | Full at ≤ target. Linear decay over 150 km (500 km → 0). 40% if unknown. |
| Grond ≥ 10.000 m² | 20 | Full at ≥ target. Linear scale-down between 5k and 10k m². 0 below 5k. |
| Vrijstaand | 15 | yes=15, no=0, unknown=6 (40%). |
| Stroom aanwezig/waarschijnlijk | 10 | present=10, likely=7, unknown=3, absent=0. |
| Water aanwezig/waarschijnlijk | 5 | Same scaling. |
| Renovatie-indicatie | 10 | ruin/needs=10, partial=5, ready=0, unknown=3. |
| Bijzonder object bonus | 5 | 5 if `isSpecialObject=true`, else 0. |
| **Totaal** | **100** | |

Every component produces a `ScoreComponent` row in the breakdown with a
Dutch evidence sentence ("€185.000 ≤ €200.000 → 20 pt").

---

## Renovation score (0..100)

Two stacked signals:

1. **Enum base** from `renovationStatus`: ruin=95, needs_renovation=85,
   partial_renovation=60, move_in_ready=30, unknown=50.
2. **Keyword bonus** (max +15): scan `title + description` against the
   per-language keyword list. Each first-time match adds +5, capped at 15.

Default keywords (configurable via `renovationKeywords` on `ScoringConfig`):

| Taal | Keywords |
| --- | --- |
| FR | à rénover · travaux à prévoir · gros potentiel · rénovation complète · à restaurer · gros oeuvre · rénovation à prévoir |
| NL | te renoveren · opknapwoning · renovatiewoning · casco · klushuis · opknapper · achterstallig onderhoud |
| DE | sanierungsbedürftig · renovierungsbedürftig · modernisierungsbedürftig · sanierung erforderlich · renovierung notwendig |
| EN | renovation · fixer upper · needs work · to restore |

---

## Special object score (0..100)

```
if isSpecialObject AND specialObjectType:
    score = specialObjectBase[type]    # watermill=100, lighthouse=100,
                                       # mill=95, station=90, lock_keeper=90,
                                       # level_crossing=88, chapel=80,
                                       # monastery=80, other=70
elif isSpecialObject (no type):
    score = 70
elif propertyType in heritagePropertyTypes:
    score = heritagePropertyBonus      # default 40
                                       # types: farmhouse, longere, manor, mansion
else:
    score = 0
```

The heritage path covers the brief's "oude hoeve, oude boerderij" — these
aren't flagged as formal special objects but still carry character and
deserve a positive signal in the ranking.

---

## Data confidence (0..100)

Prefers the normalization engine's output:
- If `normalizationConfidence` is passed in → use verbatim.
- Otherwise → weighted populated-field fallback:

| Field | Weight |
| --- | -: |
| prijs | 25 |
| grondoppervlak | 20 |
| woningtype (≠ unknown) | 12 |
| locatie | 11 |
| vrijstaand-flag (≠ unknown) | 10 |
| renovatiestatus (≠ unknown) | 10 |
| woonoppervlak | 5 |
| stroom (≠ unknown) | 4 |
| water (≠ unknown) | 3 |

When the normalization pipeline writes a `_normalization_confidence`
feature on a listing (fase 5+), the scoring service automatically picks it
up — see `pickNormalizationConfidence()` in `src/server/services/scoring.ts`.

---

## Investment potential (0..100)

Combines 6 factors:

| Component | Max | Logic |
| --- | -: | --- |
| Prijs per m² grond | 25 | Linear: 5 €/m² = full, 25 €/m² = 0. |
| Hoeveelheid grond | 20 | 0 below 10k m², 10 at 10k, full 20 at ≥30k. |
| Bijzonder object | 15 | 15 if true, 0 if false. |
| Locatieafstand | 15 | ≤100 km=15, 100..350 km linear 15→5, >350 km linear 5→0 over 150 km. |
| Renovatiestatus (upside) | 20 | ruin=20, needs=18, partial=10, ready=5, unknown=8. |
| Data-vertrouwen | 5 | `dataConfidence / 20` (rounded). |
| **Totaal** | **100** | |

---

## Composite score

```
composite = matchScore        × 0.30
          + renovationScore   × 0.15
          + specialObjectScore× 0.30
          + dataConfidence    × 0.10
          + investmentPotentialScore × 0.15
```

Weights live on `config.composite` and **must sum to 1.0** — `makeScoringConfig()`
validates this at config-merge time and throws otherwise. Why such a high
weight on `specialObjectScore`? The brief explicitly asks special objects to
surface prominently; a mediocre match on a unique watermill should beat a
perfect match on a generic detached house.

---

## Configurable weights

```ts
import { makeScoringConfig, scoreListing } from "@/server/scoring";

const config = makeScoringConfig({
  // Boost special objects further, cut data confidence weight.
  composite: {
    matchScore: 0.25,
    renovationScore: 0.15,
    specialObjectScore: 0.40,
    dataConfidence: 0.05,
    investmentPotentialScore: 0.15,
  },
  // Tighter price decay.
  priceDecayEur: 50_000,
  // Tweak per-type bases.
  specialObjectBase: { watermill: 100, mill: 90, /* … */ },
  // Extra keywords for renovation bonus.
  renovationKeywords: {
    nl: ["te renoveren", "casco", "ruwbouw", "in cascostaat"],
  },
});

const result = scoreListing(input, config);
```

`makeScoringConfig()` deep-merges into `DEFAULT_SCORING_CONFIG` — pass only
the values you want to override.

---

## Endpoints

`POST /api/listings/:id/score` — admin-only. Re-score a single listing with
the current default config.

`POST /api/scoring/recalculate` — admin-only. Body:

```json
{ "listingIds": ["uuid-1", "uuid-2"] }   // omit listingIds to rescore everything
```

Both endpoints persist into `ListingScore` (1:1 with `NormalizedListing`)
and bump `processingStatus` to `scored` on first run.

---

## Explanation per score

Each score's components carry a `ScoreComponent` array with:
- `id` (e.g. `"match.price"`)
- `label` (Dutch UI label)
- `points` (actual)
- `max` (theoretical max)
- `evidence` (Dutch sentence: *"€185.000 ≤ €200.000 → 20 pt"*)

The full `components` object is stored in `ListingScore.breakdown` as JSON.
The detail page's score-breakdown card reads this directly — see
`src/app/listings/[id]/page.tsx` (`<ScoreRow>` component).

Example breakdown for a watermill listing:

```json
{
  "match": [
    { "id": "match.price", "label": "Prijs", "points": 20, "max": 20, "evidence": "€185.000 ≤ €200.000 → 20 pt" },
    { "id": "match.distance", "label": "Afstand vanaf Venlo", "points": 15, "max": 15, "evidence": "215 km ≤ 350 km → 15 pt" },
    /* … */
  ],
  "renovation": [
    { "id": "renovation.status.partial_renovation", "points": 60, "max": 100, "evidence": "enum-waarde → 60 pt" },
    { "id": "renovation.keyword_bonus", "points": 10, "max": 15, "evidence": "2 matches: à rénover, gros oeuvre" }
  ],
  "specialObject": [
    { "id": "special.type.watermill", "points": 100, "max": 100, "evidence": "specialObjectType=watermill → 100 pt" }
  ],
  /* … */
}
```

---

## Tests — 47 deterministic cases

| Group | File | Tests |
| --- | --- | -: |
| Match (8 components, decay curves, clamping) | `match.test.ts` | 12 |
| Renovation (enum + 4 languages + cap) | `renovation.test.ts` | 7 |
| Special objects (5 brief types + heritage + custom config) | `special.test.ts` | 10 |
| Investment (6 factors + clamping) | `investment.test.ts` | 9 |
| Engine integration (compositeScore math, weights validation, determinism) | `engine.test.ts` | 9 |
| Service layer smoke (Prisma upsert + processingStatus bump) | `../services/scoring.test.ts` | 3 |

Run:

```powershell
pnpm test src/server/scoring
pnpm test src/server/services/scoring
```
