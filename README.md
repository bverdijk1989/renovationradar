# Renovation Radar EU

Vind opknaphuizen, boerderijen, vrijstaande huizen en bijzondere objecten
(molens, watermolens, stationsgebouwen, sluiswachtershuizen, vuurtorens) in
Frankrijk, België en Duitsland, binnen 350 km van Venlo.

**Hard criteria:** ≤ €200.000 · ≥ 1 ha grond · vrijstaand · stroom aanwezig of waarschijnlijk · ≤ 350 km van Venlo.

> Status: **fase 4 deel 6 / 8 — alerts engine**. Datamodel, REST API, complete UI met `/notifications`-pagina, normalization + scoring + connector + discovery + geocoding frameworks, én een alerts-engine met realtime evaluator, dagelijkse digest, dedup via (alert × listing × event-type), in-app delivery (werkend) + email/webhook placeholders (39 tests). BullMQ scheduler + real email-delivery zijn fase 5+.
>
> Endpoint reference: [`docs/API.md`](docs/API.md) · Normalization: [`docs/NORMALIZATION.md`](docs/NORMALIZATION.md) · Scoring: [`docs/SCORING.md`](docs/SCORING.md) · Connectors: [`docs/CONNECTORS.md`](docs/CONNECTORS.md) · Discovery: [`docs/DISCOVERY.md`](docs/DISCOVERY.md) · Geocoding: [`docs/GEOCODING.md`](docs/GEOCODING.md) · Alerts: [`docs/ALERTS.md`](docs/ALERTS.md).

---

## Stack

| Laag | Keuze |
| --- | --- |
| Framework | Next.js 14 (App Router + Server Components) |
| Taal | TypeScript |
| UI | Tailwind CSS · shadcn/ui · Leaflet · SWR · lucide-react |
| Database | PostgreSQL 16 + PostGIS 3.4 |
| ORM | Prisma 5, UUID v7 primary keys |
| Auth | Dev cookie-shim (NextAuth volgt later) |
| Queue | Redis + BullMQ *(volgt in fase 4)* |
| Search | Meilisearch *(volgt in fase 4)* |
| Validatie | Zod |
| Tests | Vitest |

---

## 1. Migratie-instructies

### Eerste setup van een schone DB

```powershell
pnpm install
Copy-Item .env.example .env       # vul NEXTAUTH_SECRET (32-byte base64)
docker compose up -d              # postgres + postgis, redis, meilisearch
pnpm prisma generate
pnpm prisma migrate dev --name init
pnpm db:postgis                   # idempotent: triggers + GiST + trigram indexes
pnpm db:seed                      # search profiles + sources + 11 test listings
pnpm dev                          # http://localhost:3000
```

### Bestaande DB updaten

```powershell
pnpm prisma migrate dev           # past nieuwe schema-diff toe
pnpm db:postgis                   # idempotent — kan altijd opnieuw
pnpm db:seed                      # idempotent op deterministische UUIDs
```

### Volledige reset

```powershell
pnpm db:reset
# = prisma migrate reset --force && db:postgis && db:seed
```

### Waarom `db:postgis` apart van Prisma migrations?

`prisma migrate` snapt geen Postgres-triggers, geen GiST-indexes op
Unsupported types, en geen pg_trgm operator classes. We laten Prisma de
tabellen + reguliere indexes beheren, en behandelen PostGIS-bits in
`prisma/sql/postgis_setup.sql` — een idempotent SQL-bestand dat we via
`scripts/apply-postgis.ts` toepassen. Zo blijft `prisma migrate dev` op
toekomstige schema-wijzigingen voorspelbaar.

---

## 2. Datamodel — overzicht en relaties

### De 16 modellen (+ NextAuth support + vector placeholder)

```
User ─┬─ Account/Session/VerificationToken      (NextAuth support)
      ├─ Alert                                  (saved search → criteria JSON)
      ├─ SavedListing ──► NormalizedListing
      ├─ SourceReview ──► Source                (audit van legal checks)
      └─ AuditLog

Source ─┬─ RawListing ────► NormalizedListing   (1 raw kan koppelen aan 1 normalized)
        ├─ NormalizedListing
        ├─ CrawlJob ◄────── SearchProfile?      (optionele driver)
        └─ SourceReview

Agency ──► NormalizedListing                    (makelaar, optioneel)

SearchProfile (FR/BE/DE × language × category × terms[])

NormalizedListing ─┬─ ListingLocation (1:1, lat/lng/PostGIS/km)
                   ├─ ListingScore   (1:1, 5 scores + composite + breakdown)
                   ├─ ListingEmbedding (1:1, placeholder voor pgvector)
                   ├─ ListingMedia   (n:1, image/video/floor_plan/etc.)
                   ├─ ListingFeature (n:1, open key-value met confidence)
                   └─ DeduplicationGroup (n:1 lid, 1:1 representative)
```

### Belangrijke relaties

- **Source → NormalizedListing**: elke listing heeft één originele bron.
  `Source.status = active` is een hard precondition voor connectors;
  externe bronnen starten als `pending_review`.
- **RawListing → NormalizedListing**: één-richting; één raw kan bijdragen
  aan één normalized, maar één normalized kan meerdere raws hebben (re-fetch,
  multi-source merge). De relatie staat `onDelete: SetNull` zodat raw
  payloads bewaard blijven als analytische audittrail.
- **NormalizedListing.fingerprint (unique)**: sha256 van
  `(country, postal_code, address_line, price_eur, land_area_m2)`. Triggert
  een groep-lookup in de Deduplication Engine; bij collision wordt een
  `DeduplicationGroup` aangemaakt of bestaande uitgebreid.
- **DeduplicationGroup.representativeListing**: één lid wordt gekozen als
  canonical voor dashboard-weergave; alle anderen blijven queryable als
  `members`.
- **ListingLocation (1:1)**: aparte tabel zodat de geocoder-worker
  onafhankelijk kan schrijven en zodat PostGIS-specifieke kolommen niet de
  hoofd-listing-rij opblazen. Een Postgres-trigger vult `location`
  (geography) en `distance_from_venlo_km` automatisch bij elke
  insert/update van lat/lng.
- **ListingFeature**: open schema voor uitgepakte signalen
  (`has_well`, `has_fireplace`, `barn_count`, `pond_area_m2`, ...). Elke
  feature heeft `confidence` (0..1) en `source` (`source_data` /
  `extracted_text` / `llm` / `manual`) — de scoring engine kan zo
  unzekere LLM-features lager wegen dan structured source data.
- **ListingEmbedding**: bevat nu alleen `model_name`, `dimensions`, `meta`,
  `generated_at`. De vector-kolom zelf komt in een aparte migratie als
  pgvector wordt aangezet (zie commentaar onderaan
  `prisma/sql/postgis_setup.sql`).
- **CrawlJob → SearchProfile?**: een job kan gedreven worden door een
  specifiek search profile (gerichte run) of een NULL profile (full sweep).
- **SourceReview**: audit-trail per ToS/robots/legal-controle. Het hele
  punt is om defensibly te kunnen aantonen "we hebben deze bron opnieuw
  beoordeeld op X met deze evidence URL". Surfaces in de admin UI (fase 6).

### Enum-overzicht

| Enum | Waarden |
| --- | --- |
| `Country` | FR, BE, DE, NL |
| `Language` | fr, nl, de, en |
| `UserRole` | admin, user |
| `SourceType` | api, rss, sitemap, manual, email, scrape |
| `CollectionMethod` | api, rss, sitemap, manual_entry, email_inbox, scrape_with_permission |
| `SourceStatus` | active, paused, blocked, retired, pending_review |
| `RobotsStatus` | allows, disallows, partial, not_applicable, unknown |
| `TermsStatus` | allows, prohibits, unclear, custom_agreement, not_applicable, unknown |
| `LegalStatus` | green, amber, red, pending_review |
| `PropertyType` | detached_house, farmhouse, longere, manor, mansion, barn, ruin, mill, watermill, station_building, lock_keeper_house, level_crossing_house, lighthouse, chapel, monastery, other, unknown |
| `SpecialObjectType` | mill, watermill, station_building, lock_keeper_house, level_crossing_house, lighthouse, chapel, monastery, other |
| `RenovationStatus` | ruin, needs_renovation, partial_renovation, move_in_ready, unknown |
| `TernaryFlag` | yes, no, unknown |
| `UtilityStatus` | present, likely, absent, unknown |
| `EnergyClass` | A_PLUS, A, B, C, D, E, F, G, unknown |
| `ListingAvailability` | for_sale, under_offer, sold, withdrawn, unknown |
| `ProcessingStatus` | raw, normalized, geocoded, scored, ready, error |
| `MediaType` | image, video, floor_plan, virtual_tour, document |
| `FeatureSource` | source_data, extracted_text, llm, manual |
| `CrawlJobStatus` | queued, running, succeeded, failed, partial, cancelled |
| `ReviewReason` | low_confidence, geocoding_failed, translation_failed, ambiguous_property_type, ambiguous_special_object, price_outlier, duplicate_suspected, manual_flag |
| `ReviewStatus` | pending, approved, rejected, needs_more_info |
| `AlertChannel` | email, web_push, in_app |
| `AlertFrequency` | instant, daily, weekly |
| `AuditAction` | create, update, delete, view, login, logout, source_check, listing_accepted, listing_rejected, listing_archived, alert_dispatched, crawl_started, crawl_finished |

### Indexen (verplicht per brief)

| Veld | Tabel | Reden |
| --- | --- | --- |
| `country` | normalized_listings | hard filter |
| `price_eur` | normalized_listings | sort + filter ≤200k |
| `land_area_m2` | normalized_listings | sort + filter ≥10k |
| `property_type` | normalized_listings | category filter |
| `is_special_object` | normalized_listings | "alleen bijzondere objecten" toggle |
| `match_score` | listing_scores | sort op kwaliteit |
| `composite_score` | listing_scores | sort op samengesteld |
| `distance_from_venlo_km` | listing_locations | radius filter |
| `location` (GiST) | listing_locations | bbox / nearest-neighbor queries |
| `title_original`, `title_nl`, `address_line` (GIN trigram) | normalized_listings | fuzzy text search |
| `(country, availability, price_eur, land_area_m2)` | normalized_listings | composite voor de dashboard-mainquery |

---

## 3. Seed script

`prisma/seed.ts` doet, in volgorde:

1. **Search profiles** — 12 profielen × `country × language × category`,
   één regel per term uit de brief.
2. **Sources** — 8 rijen: 4 `manual_entry · {country}` op
   `status=active, legal=green`, plus 4 externe placeholders op
   `status=pending_review, legal=pending_review`. Re-seed laat
   menselijke status-keuzes (status, robots, terms, legal) staan.
3. **Agencies** — 4 voorbeeld-makelaars (1× Lorraine FR, 1× Rural FR,
   1× Wallonia BE, 1× Eifel DE).
4. **Listings** — 11 testadvertenties (zie sectie 5). Per listing:
   - `NormalizedListing` met deterministische UUID + fingerprint
   - `ListingLocation` (lat/lng → trigger vult `location` en `distance_from_venlo_km`)
   - `ListingScore` met composite afgeleid via `composeScore()` uit
     `src/lib/scoring/types.ts`
   - `ListingMedia` (picsum placeholders)
   - `ListingFeature` (key-value met confidence)
5. **Dev admin** — alleen als `SEED_DEV_ADMIN_EMAIL` is gezet in `.env`.

### Idempotentie

Elke seed-entiteit krijgt een **deterministische UUID v5-style id**,
afgeleid van een stabiele `seedKey`:

```
seedUuid("listing::fr_longere_meuse") → b3a4e7d2-...
```

Een tweede `pnpm db:seed` upsertt dus op dezelfde id's — geen duplicates,
geen handmatige cleanup. Listings, scores, locations, media en features
worden bij re-seed wel opnieuw geschreven (test-data is geen
menselijk-eigendom). Source-statuses (active/pending_review/etc.) en
robots/terms/legal blijven staan zoals een admin ze heeft achtergelaten.

---

## 4. Testdata (11 voorbeeldadvertenties)

| # | Land | Stad | Type | Bijzonder | Prijs | Grond | Afstand Venlo | Renovatie |
| -: | :--: | :-- | :-- | :--: | -: | -: | -: | :-- |
| 1 | FR | Bar-le-Duc | longère | – | €145.000 | 12.500 m² | ~250 km | needs |
| 2 | FR | Monthermé | watermill | ✓ watermill | €185.000 | 18.000 m² | ~215 km | partial |
| 3 | FR | Vitry-le-François | farmhouse | – | €110.000 | 25.000 m² | ~320 km | ruin |
| 4 | BE | Modave | farmhouse | – | €175.000 | 11.500 m² | ~115 km | needs |
| 5 | BE | Seneffe | lock_keeper_house | ✓ lock_keeper_house | €165.000 | 10.500 m² | ~165 km | partial |
| 6 | BE | Ciney | station_building | ✓ station_building | €155.000 | 10.200 m² | ~140 km | needs |
| 7 | DE | Prüm (Eifel) | farmhouse | – | €195.000 | 13.000 m² | ~115 km | needs |
| 8 | DE | Brilon (Sauerland) | watermill | ✓ watermill | €198.000 | 15.000 m² | ~150 km | partial |
| 9 | DE | Diepholz | farmhouse | – | €120.000 | 22.000 m² | ~245 km | needs |
| 10 | DE | Koblenz | mill | ✓ mill | €145.000 | 11.000 m² | ~150 km | partial |
| 11 | FR | Cherbourg | lighthouse | ✓ lighthouse | €190.000 | 10.000 m² | **~575 km** | move_in_ready |

#11 zit bewust buiten de 350km-radius zodat je in dev kunt zien dat de
afstandsfilter het correct uitsluit. Alle 11 voldoen verder aan de harde
criteria: vrijstaand, ≤ €200.000, ≥ 10.000 m².

### Specials & feature variatie

- **5 special objects** (watermill ×2, lock_keeper_house, station_building, mill, lighthouse) — dekt alle prioritair bijzondere types uit de brief.
- **Renovation status** spread: ruin (1) / needs_renovation (5) / partial_renovation (4) / move_in_ready (1).
- **Utility coverage** varieert: alles bekend (7) / één status `unknown` (2) / beide `unknown` (1, Resthof Niedersachsen).
- **Languages**: fr (6), nl (1), de (4) — alle drie aangedreven door hun search profiles.
- **Photos**: 1–2 per listing via `picsum.photos/seed/<id>/1024/768` — CC0, renderen in dev.
- **Features**: variërend van structured (`build_year`, `barn_count`) tot kwalitatief (`structural_concerns`, `mill_mechanism_preserved`) met expliciete confidence (0.5–1.0).

---

## 5. Tests

```powershell
pnpm test                  # unit tests + seed contracts (no DB needed)
pnpm test:watch            # watch mode
pnpm test:integration      # API integration tests (require TEST_DATABASE_URL)
```

Wat fase 1+2 dekt (unit tests draaien zonder DB):

- `src/lib/geo.test.ts` — haversine, bbox, withinRadius, Venlo origin
- `src/lib/scoring/types.test.ts` — composite weights, clamp, composition
- `src/lib/listings/criteria.test.ts` — brief-defaults en Zod-validatie
- `tests/seed-data.test.ts` — élke brief-keyword en seed-bron correct
- `src/server/services/sources.test.ts` — activate green-gate, check writes SourceReview, force-pause op legal downgrade
- `src/server/services/listings.test.ts` — buildListingWhere voor 8 filter-vormen
- `src/server/services/scoring.test.ts` — match/renovation/special/dataConfidence/investment heuristieken
- `src/server/services/search-profiles.test.ts` — Zod schema's

Integratietests (vereisen Postgres+PostGIS via `TEST_DATABASE_URL`):

- `tests/api/sources.integration.test.ts` — volledig lifecycle (create → check → activate → deactivate), green-gate, validation errors, 401/403
- `tests/api/listings.integration.test.ts` — filters (country/price/land/distance/special), manual create, fingerprint dedup, save, score, sort by composite_score

Activeer met:

```powershell
$env:TEST_DATABASE_URL = "postgresql://radar:radar@localhost:5432/renovation_radar_test"
pnpm test:integration
```

De integratie-tests passen migraties + `postgis_setup.sql` toe op de test-DB en truncaten alle tabellen tussen tests.

---

## Acceptatiecriteria fase 1 (v2)

- [x] `pnpm prisma migrate dev --name init` past het volledige schema toe.
- [x] `pnpm db:postgis` voegt PostGIS-triggers + GiST + trigram indexes toe (idempotent).
- [x] `pnpm db:seed` voegt 12 search profiles + 8 sources + 4 agencies + 11 listings + 11 locations + 11 scores + ~20 media + ~35 features toe.
- [x] `pnpm test` slaagt zonder DB.
- [x] Alle 16 modellen uit het brief zijn aanwezig (User, Source, Agency, SearchProfile, RawListing, NormalizedListing, ListingLocation, ListingScore, ListingMedia, ListingFeature, DeduplicationGroup, Alert, SavedListing, SourceReview, CrawlJob, AuditLog) plus NextAuth support en `ListingEmbedding` placeholder.
- [x] UUID v7 primary keys via `@default(uuid(7)) @db.Uuid`.
- [x] Alle gevraagde indexen aanwezig: country, price, land_area_m2, distance_from_venlo_km, property_type, special_object, match_score.
- [x] `ListingLocation` heeft lat, lng, `distance_from_venlo_km`, plus auto-derived `location geography(Point, 4326)`.
- [x] Vector similarity heeft een placeholder-tabel (`ListingEmbedding`) zonder pgvector-afhankelijkheid.
- [x] Venlo (51.3704, 6.1724) is het referentiepunt, hard-coded in trigger + `src/lib/geo.ts`.

---

## Juridische lijn

- Geen agressieve scraping. Source Registry per bron met
  `status` / `robotsStatus` / `termsStatus` / `legalStatus`; connectors mogen
  alleen draaien als `status=active`.
- Voorkeursvolgorde: **manual entry → email forwarding → API → RSS →
  sitemap → scraping-met-toestemming**.
- Rate limits per bron worden afgedwongen in het connector framework (fase 4).
- Materiële status-veranderingen op een bron creëren een `SourceReview`-rij
  met evidence URL (bv. archive.org snapshot van de ToS).
- De seed levert *géén* externe bron als `status=active`. Activering gebeurt
  alleen in de admin UI, met audit log.

---

## Frontend (fase 3)

### Pagina's

| Route | Bestand | Inhoud |
| --- | --- | --- |
| `/` | [src/app/page.tsx](src/app/page.tsx) | Dashboard — 6 KPI cards, top 10 matches, kaartpreview, recente prijsdalingen |
| `/listings` | [src/app/listings/page.tsx](src/app/listings/page.tsx) | Alle advertenties met filter-sidebar + paginering, sorteer-knoppen |
| `/listings/[id]` | [src/app/listings/[id]/page.tsx](src/app/listings/[id]/page.tsx) | Detailpagina met gallery, kenmerken, scores-breakdown, makelaar/bron |
| `/listings/special` | [src/app/listings/special/page.tsx](src/app/listings/special/page.tsx) | Bijzondere objecten gegroepeerd op type |
| `/listings/saved` | [src/app/listings/saved/page.tsx](src/app/listings/saved/page.tsx) | Bewaarde listings van de huidige gebruiker |
| `/map` | [src/app/map/page.tsx](src/app/map/page.tsx) | Volledige Leaflet kaart met filter-sidebar links en detail-drawer rechts |
| `/agencies` | [src/app/agencies/page.tsx](src/app/agencies/page.tsx) | Makelaarbronnen overzicht |
| `/sources` | [src/app/sources/page.tsx](src/app/sources/page.tsx) | Source Registry beheer-tabel met activeer/pauzeer knoppen |
| `/review` | [src/app/review/page.tsx](src/app/review/page.tsx) | Review wachtrij — bronnen die wachten op legal review |
| `/alerts` | [src/app/alerts/page.tsx](src/app/alerts/page.tsx) | Alerts beheer met aanmaakformulier + toggle |
| `/login` | [src/app/login/page.tsx](src/app/login/page.tsx) | Dev login-shim (cookie-based, vervangt later door NextAuth) |

### Componentenstructuur

```
src/components/
├── ui/                    # shadcn/ui primitives (Button, Card, Badge, Input, …)
├── layout/                # AppShell (sidebar nav), PageHeader
├── states/                # EmptyState, ErrorState
├── listings/
│   ├── listing-card.tsx   # foto, titel, prijs, badges, score, save/ignore
│   ├── listing-filters.tsx# URL-synced filter sidebar (client)
│   ├── pagination-bar.tsx
│   ├── save-ignore-buttons.tsx
│   └── listing-card-skeleton.tsx
├── dashboard/
│   ├── kpi-card.tsx       # 1 KPI tegel
│   ├── kpi-grid.tsx       # de 6 KPI's uit de brief
│   ├── top-matches.tsx
│   ├── recent-price-drops.tsx
│   └── map-preview.tsx
└── map/
    ├── listing-map.tsx       # dynamic-imports Leaflet (client-only)
    ├── listing-map-inner.tsx # echte react-leaflet rendering
    └── special-object-icon.ts# DivIcon per special object type
```

### Hooks (client data fetching)

[`src/hooks/`](src/hooks/) — SWR-gebaseerd, `useListings`, `useSources`, `useAlerts` + mutator helpers `activateSource()` / `createAlert()` / `patchAlert()` / etc. die de SWR cache invalideren.

### Loading / Empty / Error

- **Loading**: `ListingCardSkeleton` voor lijst-pagina's, `Loader2` spin voor formulier-acties, `dynamic({ loading })` fallback voor Leaflet
- **Empty**: `<EmptyState />` met icon + titel + beschrijving + optioneel actie-button. Gebruikt op alle lijst-pagina's
- **Error**: `<ErrorState />` met retry-knop. Gebruikt voor SWR fouten en source-actie fouten

### Design

- Premium, rustig palet: mosgroen primair (`hsl(152 47% 28%)`), warm-grijs voor structuur, paars voor bijzondere objecten
- Veel witruimte (consistent `gap-4`/`gap-6` op grids, `py-8`/`py-10` op paginalevel)
- Badges drukken status uit met kleur (groen=actief, oranje=in beoordeling, rood=geblokkeerd, paars=bijzonder)
- Mobile responsive: sidebar verbergt onder `md`, grid kolommen schalen via `sm:` / `lg:` / `xl:` breakpoints
- 100% Nederlandse interface; alle enum labels via [`src/lib/format.ts`](src/lib/format.ts)

### Auth in fase 3 (dev shim)

Tot NextAuth volgt (fase 3.5/4):
- `/login` toont alle bestaande users en zet de cookie `dev-user-id`
- Server Components lezen via `getCurrentUser()` uit cookies
- API-routes lezen via `getActor()` uit cookie OF `X-Dev-User-Id` header (tests)
- In productie staat de shim uit tenzij `DEV_AUTH_BYPASS=allow`

### Tests fase 3

```powershell
pnpm test
```

Nieuwe tests:
- [src/lib/format.test.ts](src/lib/format.test.ts) — NL Euro/distance/area formatting + enum labels
- [src/components/dashboard/kpi-card.test.tsx](src/components/dashboard/kpi-card.test.tsx) — KpiCard + KpiGrid rendert alle 6 brief-KPI's
- [src/components/listings/listing-card.test.tsx](src/components/listings/listing-card.test.tsx) — titel NL-fallback, special badge gedrag, score badge, foto-empty-state, save/ignore aanwezig

Component tests draaien in jsdom (geconfigureerd via `environmentMatchGlobs` in [vitest.config.ts](vitest.config.ts)); de rest draait in Node zoals voorheen.

---

## Project layout

```
.
├── docker-compose.yml                       # postgres+postgis, redis, meilisearch
├── docs/API.md                              # 28-endpoint reference
├── prisma/
│   ├── schema.prisma                        # 17 modellen + 23 enums
│   ├── sql/postgis_setup.sql                # idempotent PostGIS triggers + indexes
│   ├── data/{search-profiles,sources,listings}.ts
│   └── seed.ts
├── scripts/apply-postgis.ts
├── src/
│   ├── app/
│   │   └── api/                             # 22 route.ts files, 28 endpoint methods
│   ├── lib/
│   │   ├── db.ts                            # Prisma singleton
│   │   ├── env.ts · geo.ts
│   │   ├── listings/criteria.ts
│   │   └── scoring/types.ts
│   └── server/
│       ├── api/{http,handler,auth,audit,pagination}.ts
│       ├── schemas/{common,sources,listings,search-profiles,alerts,jobs}.ts
│       └── services/{sources,listings,search-profiles,alerts,scoring,jobs,review}.ts
└── tests/
    ├── seed-data.test.ts
    ├── helpers/{test-db,request}.ts         # integration test harness
    └── api/{sources,listings}.integration.test.ts

src/server/normalization/                    # fase 4 deel 1 — normalization engine
├── engine.ts                                # public normalize(input)
├── types.ts                                 # NormalizationInput/Draft + Extractor interface
├── detect-language.ts                       # FR/NL/DE function-word matching
├── confidence.ts                            # weighted 0..100 aggregator
├── translate.ts                             # structured NL summary
├── extractors/{rule-based,llm}.ts           # default + plug-in stub
├── wordlists/{fr,nl,de,shared,types}.ts     # per-language keyword tables
├── index.ts
└── normalize.test.ts                        # 50+ deterministic tests

src/server/scoring/                          # fase 4 deel 2 — scoring engine
├── engine.ts                                # public scoreListing(input, config?)
├── types.ts                                 # ScoringInput/Result/Component
├── config.ts                                # weights, decay windows, keyword lists
├── match.ts                                 # 8-component match_score (per brief)
├── renovation.ts                            # enum base + per-language keyword bonus
├── special.ts                               # specialObjectType + heritage fallback
├── data-confidence.ts                       # passes through normalization confidence
├── investment.ts                            # 6-factor investment_potential
├── index.ts
└── {match,renovation,special,investment,engine}.test.ts  # 47 tests
```

## Wat volgt

| Fase | Inhoud |
| --- | --- |
| 2 | Backend API: REST + Server Actions voor listings, sources, alerts. NextAuth setup. Zod request-schemas. |
| 3 | Frontend dashboard: nieuwe matches, kaartweergave, alle advertenties, bijzondere objecten, makelaarbronnen, alerts, bronbeheer, review queue. shadcn/ui. |
| 4 | Job queue: BullMQ workers per connector-type. Meilisearch indexer. Connector framework met `Source.status` guard. |
| 5 | Normalization Engine + Translation/Feature Extraction + Geocoding + Scoring Engine + Deduplication Engine. |
| 6 | Source Registry UI + SourceReview-flow + Admin Review Queue UI + Audit Log viewer. |
| 7 | Alerts Engine: matchers, schedulers, email delivery, web push. |
| 8 | Test coverage uitbreiden: integratietests met testcontainers, E2E met Playwright. Eventueel pgvector inschakelen. |
