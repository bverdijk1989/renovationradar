# Renovation Radar EU — Testplan

Volledig testplan voor alle 15 testgebieden, mét per-case Given/When/Then,
acceptatiecriteria, templates, en CI-strategie. Verwijst naar bestaande
testbestanden waar coverage al bestaat, identificeert gaps en geeft een
roadmap voor wat nog moet komen.

> Bestaande tests: **~280 deterministische cases** verspreid over ~40
> bestanden. `pnpm test` draait alles in Node + jsdom; integratietests
> activeren met `TEST_DATABASE_URL` (zie [`tests/helpers/test-db.ts`](../tests/helpers/test-db.ts)).

---

## 1. Doel en scope

Dit testplan bewaakt drie dingen tegelijk:

1. **Brief-correctheid** — élk eis uit de oorspronkelijke specificatie
   blijft afdwingbaar via een test (filterregels, scoring-allocaties,
   juridische rails, taal-keywords).
2. **Regressie-veiligheid** — refactors mogen niet onopgemerkt iets
   breken; één test per non-obvious contract.
3. **Juridische verdedigbaarheid** — `pending_review` is écht non-active,
   robots.txt wordt écht gerespecteerd, audit logs zijn écht append-only.

Niet in scope (laatste sectie van dit document): geautomatiseerde
penetratietests, load-testing tegen productie, accessibility-audit.

---

## 2. Testpyramide

```
                   ┌────────────────┐
                   │   E2E (~10)    │  Playwright — fase 8
                   ├────────────────┤
                   │ Integration    │  Vitest + TEST_DATABASE_URL
                   │   (~25)        │  tests/api/*, tests/security/*
                   ├────────────────┤
                   │  Unit (~250)   │  Vitest, geen DB
                   │                │  pure functions: matcher, scoring,
                   │                │  classifier, normalize, geo
                   └────────────────┘
```

**Filosofie:**
- Pure-function logic (matcher, scoring, normalisatie, classifier,
  geocoding-confidence, distance) krijgt **uitputtende unit-coverage**.
- Service-laag (Prisma-roundtrips, transacties) krijgt **gerichte
  integration-tests** tegen een echte Postgres+PostGIS — geen mocks.
- E2E test slechts de **goldenpath-flows** door de UI (Playwright,
  fase 8) en houdt het aantal scenario's klein.

---

## 3. Per testgebied

Elke sectie heeft: **doel · belangrijkste contracts · bestaande coverage ·
gaps**. Gaps krijgen in sectie 9 een roadmap.

### 3.1 Datamodel

| Item | Status |
| --- | --- |
| Doel | Élk model uit de brief bestaat met de juiste velden + enums; foreign keys / unique constraints / indexes zijn aanwezig. |
| Coverage | [`tests/seed-data.test.ts`](../tests/seed-data.test.ts) (statisch, 24 cases). Trigger-gedrag via PostGIS-trigger getest in integratie-tests die lat/lng schrijven. |
| Gaps | Geen expliciete test dat `@@unique([alertId, normalizedListingId, eventType])` dedup oplevert — het *gedrag* is getest in [`alerts/evaluator.test.ts`](../src/server/alerts/evaluator.test.ts). |

### 3.2 API

| Item | Status |
| --- | --- |
| Doel | Élk endpoint accepteert valide payloads, weigert invalide met de juiste status, dwingt RBAC af, schrijft AuditLog. |
| Coverage | Integration: [`sources`](../tests/api/sources.integration.test.ts) (9), [`listings`](../tests/api/listings.integration.test.ts) (11), **`alerts`** (8), **`discovery`** (6), **`geocoding`** (5), **`notifications`** (5), **`alert-hooks`** (3) — totaal 47. Service-unit tests voor élk domein. |
| Gaps | ~~Integratie-coverage voor /api/alerts, /api/discovery/run, /api/geocoding/run-pending, /api/notifications~~ **✓ opgelost in deze ronde.** |

### 3.3 Frontend

| Item | Status |
| --- | --- |
| Doel | Componenten renderen alle vereiste velden uit de brief; lege/error-states verschijnen correct; mobile responsive grids werken. |
| Coverage | [`listing-card`](../src/components/listings/listing-card.test.tsx) (8), [`kpi-card`](../src/components/dashboard/kpi-card.test.tsx) (4), [`format`](../src/lib/format.test.ts) (6), **`listing-filters`** (5 — URL-sync), **`empty-state`** (5), **`error-state`** (5). |
| Gaps | Leaflet map (dynamic import) en notification-list interactions blijven E2E (Playwright fase 8). |

### 3.4 Source Registry

| Item | Status |
| --- | --- |
| Doel | Bron-statussen volgen het juridische verloop (`pending_review` → `active` alléén via `/check` of `/approve` met `legalStatus=green`). `SourceReview` rij per status-mutatie. Re-seed overschrijft géén human-curated veld. |
| Coverage | [`services/sources.test.ts`](../src/server/services/sources.test.ts) (8 cases), [`api/sources.integration.test.ts`](../tests/api/sources.integration.test.ts) (lifecycle + green-gate tests). Statische contract: [`seed-data.test.ts`](../tests/seed-data.test.ts). Plus [`legal/guardrails.test.ts`](../tests/legal/guardrails.test.ts). |
| Gaps | `Source.classification` mutatie via PATCH bestaat al; integration coverage volgt admin-UI test (Playwright fase 8). |

### 3.5 Connector Framework

| Item | Status |
| --- | --- |
| Doel | Élke connector implementeert `SourceConnector` correct; runner refuseert non-green / manual-only; rate limiter werkt per source; dedup via contentHash. |
| Coverage | [`runner`](../src/server/connectors/runner.test.ts) (8), [`rss`](../src/server/connectors/rss.test.ts) (6), [`sitemap`](../src/server/connectors/sitemap.test.ts) (4), [`manual`](../src/server/connectors/manual.test.ts) (4), [`rate-limit`](../src/server/connectors/rate-limit.test.ts) (5), [`xml`](../src/server/connectors/xml.test.ts) (6), **[`placeholders`](../src/server/connectors/placeholders.test.ts) (9 — Api/Html/Email stubs)**. Totaal 42. |
| Gaps | ~~Tests voor ApiConnector / HtmlConnector / EmailConnector stubs~~ **✓ opgelost.** |

### 3.6 Agency Discovery

| Item | Status |
| --- | --- |
| Doel | Discovery levert ALLEEN `pending_review` rijen op; robots.txt fail-closed; classifier scheidt portal van agency; extractor publiceert geen e-mails uit prozatext. |
| Coverage | 38 unit-cases + **6 integration via [`/api/discovery/run`](../tests/api/discovery.integration.test.ts)** — happy path persists pending source, robots-block skipt fetch, duplicate skipped, AuditLog geschreven, auth-gates. |
| Gaps | Volledige e2e door admin-UI Approve-flow blijft Playwright fase 8. |

### 3.7 Normalization Engine

| Item | Status |
| --- | --- |
| Doel | Pure functie: `normalize(input)` = `normalize(input)`. Elk brief-veld extractable. Élke FR/NL/DE taal-keyword herkend. |
| Coverage | [`normalize.test.ts`](../src/server/normalization/normalize.test.ts) — 50 cases. **`extractors/llm.test.ts` (2)** voor de stub. |
| Gaps | ~~LLM-extractor stub test~~ **✓ opgelost.** Echte LLM-implementatie blijft fase 5+. |

### 3.8 Scoring Engine

| Item | Status |
| --- | --- |
| Doel | De brief's punt-allocaties (20+15+20+15+10+5+10+5=100) zijn vastgepind. Renovation-keywords per taal fire. Special-object types krijgen de juiste base. Composite math is verifieerbaar. |
| Coverage | 47 cases over [`match`](../src/server/scoring/match.test.ts) (12), [`renovation`](../src/server/scoring/renovation.test.ts) (7), [`special`](../src/server/scoring/special.test.ts) (10), [`investment`](../src/server/scoring/investment.test.ts) (9), [`engine`](../src/server/scoring/engine.test.ts) (9). **`scoring-batch.test.ts` (4)** voor `recalculateAllScores` cursor-pagination. |
| Gaps | ~~Test op recalculateAllScores batch~~ **✓ opgelost.** |

### 3.9 Geocoding

| Item | Status |
| --- | --- |
| Doel | Adres → lat/lng → distance via PostGIS-trigger. Confidence gecapped door query-completeness. Cache vermijdt herhaalde provider-calls. Robots.txt-equivalent niet van toepassing (Nominatim heeft een rate-limit policy die we honoreren). |
| Coverage | 34 unit-cases + **5 integration via [`/api/listings/:id/geocode` en `/api/geocoding/run-pending`](../tests/api/geocoding.integration.test.ts)** — insufficient address, region centroid fallback, Nominatim mock, batch run-pending. |
| Gaps | ~~Test op geocodePending batch~~ **✓ opgelost.** Echte 1-req/sec timing-test blijft fase 8 (performance-suite). |

### 3.10 Deduplication

| Item | Status |
| --- | --- |
| Doel | Identieke fingerprint = unique-constraint violation = geen dubbele insert. Engine zelf (cross-source dedup → DeduplicationGroup) is fase 5+. |
| Coverage | Connector runner: P2002 telt als `itemsRejected`. Listing service: manual create met dezelfde fingerprint → 409 conflict. Beide in integration. |
| Gaps | DeduplicationGroup-engine bestaat nog niet (fase 5+). |

### 3.11 Alerts

| Item | Status |
| --- | --- |
| Doel | Matcher = pure functie. Realtime evaluator schrijft AlertNotification met dedup. Dispatcher routeert per channel. Digest pakt daily/weekly correct. |
| Coverage | 39 unit-cases + **8 integration via [`/api/alerts`](../tests/api/alerts.integration.test.ts) + [`/api/notifications`](../tests/api/notifications.integration.test.ts) + [`alert-hooks`](../tests/api/alert-hooks.integration.test.ts)** (service-path hooks). |
| Gaps | ~~End-to-end /api/notifications + service-hook integration~~ **✓ opgelost.** |

### 3.12 Security

| Item | Status |
| --- | --- |
| Doel | Endpoints zonder admin role → 403. Endpoints zonder auth → 401. SQL injection onmogelijk (Prisma). XSS in user-input wordt geneutraliseerd door React's default escaping. Headers `X-Dev-User-Id` worden in productie alléén geaccepteerd met `DEV_AUTH_BYPASS=allow`. |
| Coverage | [`tests/security/auth-rbac.integration.test.ts`](../tests/security/auth-rbac.integration.test.ts) — endpoint × role-matrix over 17 endpoints + production-bypass guard. Plus `pnpm audit` in CI ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml) jobs draaien op élke push). |
| Gaps | CSRF-token check blijft pending tot NextAuth integratie (fase 3/8) — SameSite=Lax cookies + same-origin fetches geven al een basale verdediging. |

### 3.13 Privacy

| Item | Status |
| --- | --- |
| Doel | E-mails / telefoonnummers worden alléén geëxtraheerd uit expliciete `mailto:` / `tel:` links. AuditLog bewaart IP/UA voor mutaties (debugbaarheid). Geen scraping van persoonlijke namen. |
| Coverage | [`discovery/extractor.test.ts`](../src/server/discovery/extractor.test.ts) + [`legal/guardrails.test.ts`](../tests/legal/guardrails.test.ts) — twee statische contract-tests dat e-mail/telefoon NOOIT uit prozatext komt. |
| Gaps | Geen right-to-erasure flow (GDPR Art. 17) — bewust uit scope tot er echte gebruikers zijn. |

### 3.14 Performance

| Item | Status |
| --- | --- |
| Doel | Dashboard-query (top 10 matches met filter + sort) < 100ms op typische dataset. Map points-query < 200ms voor 500 punten. PostGIS GIST index wordt geraakt. |
| Coverage | **[`tests/perf/dashboard-queries.bench.ts`](../tests/perf/dashboard-queries.bench.ts)** — `EXPLAIN ANALYZE`-driven scaffold die de hot queries valideert: top-10-matches, map-points (GIST), trigram-search. Gated op `TEST_DATABASE_URL`. |
| Gaps | Echte load-test op productie-dataset (≥10k listings) blijft fase 8 — vereist seedscript voor synthetische data. |

### 3.15 Juridische guardrails

| Item | Status |
| --- | --- |
| Doel | Discovery activeert nooit. Connector framework runner refuseert non-green. Manual-only sources gaan nooit door de scraper. SourceReview wordt geschreven bij élke status-mutatie. Robots.txt fail-closed. |
| Coverage | **Nieuw**: [`tests/legal/guardrails.test.ts`](../tests/legal/guardrails.test.ts) — statische asserties op seed + service-defaults. Plus de runner-legal-gate tests in connector-runner. |
| Gaps | Geen test dat `Source.discoveryMeta` correct gerendered wordt in de admin review UI (visueel). |

---

## 4. De 17 vereiste testcases

Elke case staat als **Given / When / Then** met een verwijzing naar het
implementerende testbestand. Cases zonder verwijzing zijn nieuw of expliciet
out-of-scope (sectie 9).

### 4.1 Prijsfilter

```
Given  een dashboard-query met maxPriceEur=200000
When   de lijst geladen wordt
Then   élk resultaat heeft priceEur ≤ 200000
       en de paginering klopt
```
Bron: [`tests/api/listings.integration.test.ts`](../tests/api/listings.integration.test.ts) →
*"filters by price range + land minimum"*.

### 4.2 Afstandsfilter

```
Given  twee listings, lat/lng 49.8/4.75 (~215 km) en 49.65/-1.5 (~575 km)
When   GET /api/listings?maxDistanceKm=350
Then   alleen de eerste komt terug
```
Bron: [`listings.integration.test.ts`](../tests/api/listings.integration.test.ts) →
*"filters by distance from Venlo"*.

### 4.3 Grondoppervlakfilter

```
Given  twee listings, 12.000 m² en 8.000 m²
When   GET /api/listings?minLandM2=10000
Then   alleen de 12.000 m² listing komt terug
```
Bron: idem *"filters by price range + land minimum"*.

### 4.4 Vrijstaand-detectie

```
Given  een titel "Maison mitoyenne" met taal=fr
When   normalize(input) draait
Then   draft.isDetached === "no" met confidence > 0.7
       en evidence = "niet-vrijstaand trefwoord: 'mitoyenne'"
```
Bron: [`normalize.test.ts`](../src/server/normalization/normalize.test.ts) →
*"detached: no: mitoyenne (FR)"* + *"yes: maison individuelle"* + *"unknown when no signal"*.

### 4.5 Renovatie-detectie

```
Given  "Corps de ferme en ruine, à rénover entièrement"
When   normalize(input)
Then   renovationStatus === "ruin"  (ruin domineert needs_renovation)
```
Bron: [`normalize.test.ts`](../src/server/normalization/normalize.test.ts) →
*"ruin dominates over needs_renovation"* + 3 andere renovation tests.

### 4.6 Bijzondere objecten

```
Given  "Ancien moulin à eau à vendre", land=FR
When   normalize(input)
Then   isSpecialObject === true
       specialObjectType === "watermill"
```
Bron: [`normalize.test.ts`](../src/server/normalization/normalize.test.ts) →
*"special objects: watermill (FR)"* + 6 andere types (mill/lock_keeper/station/lighthouse/farmhouse).

### 4.7 Lokale taal-zoektermen

```
Given  Search profile FR · objets spéciaux met termen
       ["moulin à vendre", "ancien moulin", "moulin à eau",
        "ancienne gare", "maison éclusière", "maison de garde-barrière"]
When   pnpm db:seed
Then   élke brief-keyword zit in minstens één profiel
```
Bron: [`tests/seed-data.test.ts`](../tests/seed-data.test.ts) — vier groepen:
*FR · fr profiles contain every required FR term*, *BE · nl*, *BE · fr*, *DE · de*.

### 4.8 Duplicate detection

```
Given  een bestaande listing met fingerprint X
When   POST /api/listings/manual met identiek adres+prijs+grond
Then   409 Conflict met details.existingListingId

Given  een RSS-feed met dezelfde item twee runs achter elkaar
When   runConnectorJob de tweede run uitvoert
Then   itemsAccepted=0, itemsRejected=N, geen extra RawListing rijen
       (P2002 op (sourceId, contentHash) silent gehandeld)
```
Bron: [`listings.integration.test.ts`](../tests/api/listings.integration.test.ts) → *"manual create rejects duplicate fingerprint"*;
[`connectors/runner.test.ts`](../src/server/connectors/runner.test.ts) → *"dedup: P2002 unique violation counts as rejected, not error"*.

### 4.9 Bronstatus `blocked`

```
Given  een Source met status=blocked, legalStatus=red
When   runConnectorJob(jobId) wordt aangeroepen
Then   CrawlJob.status='failed' met errorMessage matching /legal_gate_blocked/
       en NO HTTP-request wordt gemaakt (transport-mock niet aangeroepen)
```
Bron: [`runner.test.ts`](../src/server/connectors/runner.test.ts) → *"refuses to run when source.status != active"*.

### 4.10 Bronstatus `manual_only`

```
Given  een Source met collectionMethods=["manual_entry"]
When   runConnectorJob(jobId)
Then   LegalGateError → CrawlJob.errorMessage matching /manual-entry only/
```
Bron: [`runner.test.ts`](../src/server/connectors/runner.test.ts) → *"refuses to crawl manual-only sources"*.

### 4.11 Lege resultaten

```
Given  GET /api/listings?country=NL  (geen NL listings in fixture)
When   de lijst geladen wordt
Then   200 OK, data=[], pagination.total=0, pageCount=1

Given  /listings pagina met dezelfde filter
When   gerendered
Then   <EmptyState> met titel "Geen advertenties gevonden"
```
Bron: integration impliciet via filter-tests; UI-state via component-coverage van `<EmptyState>` rendering.

### 4.12 Foutieve brondata

```
Given  een RSS-feed met onverwachte XML structuur
       (bv. <foo>not-an-item</foo> waar <item> verwacht wordt)
When   RssConnector parset
Then   ParseError → runner markeert CrawlJob.status=failed
       met errorMessage matching /Response does not look like rss/
       Geen RawListing wordt geschreven.
```
Bron: [`rss.test.ts`](../src/server/connectors/rss.test.ts) → *"throws ParseError on non-XML body"*.

### 4.13 Incomplete locatie

```
Given  een listing met alleen region="Lorraine", geen city/postalCode/addressLine
When   geocodeListing(id) draait
Then   primary provider returnt null
       fallback EstimatedRegionProvider levert centroid (49.10, 6.10)
       distanceType="estimated", distanceConfidence="low"
```
Bron: [`geocoding/engine.test.ts`](../src/server/geocoding/engine.test.ts) →
*"provider returns null → falls back to region centroid"*.

### 4.14 Onbetrouwbare nutsvoorzieningen

```
Given  een listing zonder enige nuts-signaal in titel/beschrijving
When   normalize(input)
Then   electricityStatus="unknown" (confidence=0.2)
       waterStatus="unknown"

Given  dezelfde listing → scoreMatch met DEFAULT_SCORING_CONFIG
When   gescoord
Then   match.electricity.points = 3   (30% van max=10)
       match.water.points       = 1.5 → afgerond 2  (30% van max=5)
```
Bron: [`normalize.test.ts`](../src/server/normalization/normalize.test.ts) → *"unknown when nothing said"*;
[`scoring/match.test.ts`](../src/server/scoring/match.test.ts) → *"electricity: ... unknown=3"*.

### 4.15 Scoreberekening

```
Given  een listing met priceEur=100000, landAreaM2=50000,
       distance=50km, isDetached="yes", electricity=present, water=present,
       renovationStatus="needs_renovation", isSpecialObject=true (watermill)
When   scoreListing(input, DEFAULT_SCORING_CONFIG)
Then   matchScore = 100  (alle 8 componenten op max)
       specialObjectScore = 100  (watermill base)
       renovationScore > 85  (enum + keyword bonus)
       composite > 85
       Σ score × weight matcht compositeScore exact
```
Bron: [`scoring/engine.test.ts`](../src/server/scoring/engine.test.ts) → *"brief-perfect watermill produces near-100"* + *"compositeScore = Σ score × weight"*.

### 4.16 Alert bij nieuwe match

```
Given  een enabled alert met country=["FR"], maxPriceEur=200000,
       eventTypes=["new_match"], frequency="instant"
When   manualCreateListing fires een nieuw FR-listing onder €200k
Then   evaluateListingEvent → matcher.match returnt {matches:true}
       AlertNotification.create met status=pending, eventType=new_match
       Dispatcher.dispatch → status=dispatched
       /api/notifications voor de user toont 1 rij
```
Bron: [`alerts/matcher.test.ts`](../src/server/alerts/matcher.test.ts) (match-pad) +
[`alerts/evaluator.test.ts`](../src/server/alerts/evaluator.test.ts) → *"matching alert creates a notification + dispatches when instant"*.

### 4.17 Alert bij prijsdaling

```
Given  een listing met priceEur=200000 en een alert
       eventTypes=["price_drop"], minPriceDropPercent=10
When   patchListing zet priceEur=150000 (25% daling)
Then   evaluator fires event { type:'price_drop', previousPriceEur:200000 }
       matcher accepteert (25% ≥ 10%)
       AlertNotification.payload bevat
         { previousPriceEur:200000, dropEur:50000, dropPercent:25.0 }

       Tegen-test: priceEur=195000 (2.5% daling)
       matcher returnt {matches:false, reason:"prijsdaling 2.5% < drempel 10%"}
```
Bron: [`alerts/matcher.test.ts`](../src/server/alerts/matcher.test.ts) →
*"large drop → matches with payload populated"* + *"minPriceDropPercent enforced"*.

---

## 5. Acceptatiecriteria per fase

Wat moet "groen" zijn voordat de fase als "klaar" wordt verklaard.

### Fase 1 — Datamodel
- [x] `pnpm prisma migrate dev` zonder fouten.
- [x] `pnpm db:postgis` idempotent.
- [x] `pnpm db:seed` plaatst 12 search profiles + 8 sources + 11 listings.
- [x] `tests/seed-data.test.ts` slaagt — élke brief-keyword in een profiel.

### Fase 2 — Backend API
- [x] Alle 28 endpoints retourneren consistente error envelopes.
- [x] Admin-only endpoints retourneren 403 voor non-admin (auth-rbac suite).
- [x] Unauth endpoints retourneren 401 wanneer auth ontbreekt.
- [x] Listings-filters dekken: country, price, land, distance, special, renovation, utility, score.

### Fase 3 — Frontend
- [x] 10 pagina's renderen zonder runtime-fouten.
- [x] Empty states + error states verschijnen waar verwacht.
- [x] Listing-card toont alle 13 brief-velden (foto/titel/prijs/land/regio/afstand/grond/woningtype/renovatie/bijzonder/nuts/match/knoppen).
- [x] Leaflet kaart laadt dynamic (geen SSR-fout).

### Fase 4 — Engines
- [x] Normalization: 50 tests groen, déterministisch.
- [x] Scoring: 47 tests groen, weights sommeren tot 1.0.
- [x] Connectors: legal gate refuseert non-green; runner schrijft CrawlJob lifecycle correct.
- [x] Discovery: nooit auto-activatie; robots.txt fail-closed.
- [x] Geocoding: confidence gecapped door query-completeness; cache hits incrementeren `hits`.
- [x] Alerts: dedup via unique constraint; instant dispatcht; daily wacht op digest.

### Fase 5+ — Workers / LLM / Dedup engine
- [ ] BullMQ workers pakken queued CrawlJobs en NormalizedListings op.
- [ ] LLM extractor vervangt LlmExtractor-stub voor low-confidence velden.
- [ ] DeduplicationGroup engine groepeert listings via fuzzy match.
- [ ] Real email delivery (Resend/Postmark) vervangt placeholder.

---

## 6. Templates

Patterns die elke nieuwe test moet volgen.

### 6.1 Unit test (pure function)

```ts
import { describe, it, expect } from "vitest";
import { myPureFunction } from "./module";

describe("myPureFunction", () => {
  it("happy path returns expected shape", () => {
    expect(myPureFunction({ a: 1, b: 2 })).toEqual({ result: 3 });
  });

  it("rejects invalid input", () => {
    expect(() => myPureFunction({ a: -1 } as never)).toThrow();
  });

  it("is deterministic", () => {
    const input = { a: 1, b: 2 };
    expect(myPureFunction(input)).toEqual(myPureFunction(input));
  });
});
```

### 6.2 Service test (mocked Prisma)

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    myModel: { findUnique: vi.fn(), update: vi.fn() },
  },
}));
vi.mock("@/lib/db", () => ({ prisma: mockPrisma }));

import { myService } from "./my-service";

beforeEach(() => vi.clearAllMocks());

describe("myService", () => {
  it("upserts and returns the row", async () => {
    mockPrisma.myModel.update.mockResolvedValue({ id: "x" });
    const r = await myService.doThing("x");
    expect(r.id).toBe("x");
    expect(mockPrisma.myModel.update).toHaveBeenCalledTimes(1);
  });
});
```

### 6.3 Integration test (real Postgres)

```ts
import { it, expect } from "vitest";
import {
  describeIntegration,
  getTestPrisma,
  withIntegrationDb,
} from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";
import { GET as endpoint } from "@/app/api/.../route";

describeIntegration("/api/foo", () => {
  withIntegrationDb();

  it("does the thing end-to-end", async () => {
    const admin = await getTestPrisma().user.create({
      data: { email: "admin@test.local", role: "admin" },
    });
    const req = makeRequest("GET", "/api/foo", { userId: admin.id });
    const { status, body } = await invoke(endpoint, req);
    expect(status).toBe(200);
    expect(body).toMatchObject({ /* … */ });
  });
});
```

### 6.4 E2E scenario (Playwright — fase 8)

```ts
import { test, expect } from "@playwright/test";

test("admin onboards a new RSS source", async ({ page }) => {
  await loginAsAdmin(page);
  await page.goto("/sources");
  await page.getByRole("button", { name: /Nieuwe bron/i }).click();
  await page.getByLabel("Naam").fill("Test RSS");
  await page.getByLabel("Land").selectOption("FR");
  await page.getByLabel("Website").fill("https://example.fr/feed");
  await page.getByLabel("Type").selectOption("rss");
  await page.getByRole("button", { name: /Opslaan/i }).click();

  await expect(page.getByText("Test RSS")).toBeVisible();
  await expect(page.getByText(/pending_review/i)).toBeVisible();

  // De bron MAG NIET activeerbaar zijn voordat de legal-check groen is.
  await page.getByRole("button", { name: /Activeer/i }).click();
  await expect(page.getByText(/legalStatus.*green/i)).toBeVisible();
});
```

### 6.5 Security test

```ts
import { it, expect } from "vitest";
import { describeIntegration, getTestPrisma, withIntegrationDb } from "../helpers/test-db";
import { invoke, makeRequest } from "../helpers/request";
import { POST as create } from "@/app/api/sources/route";

describeIntegration("POST /api/sources — RBAC", () => {
  withIntegrationDb();

  it("returns 401 when no auth header / cookie", async () => {
    const req = makeRequest("POST", "/api/sources", {
      body: { name: "x", country: "FR", website: "https://x", sourceType: "rss", collectionMethods: ["rss"] },
    });
    const { status } = await invoke(create, req);
    expect(status).toBe(401);
  });

  it("returns 403 when user role !== admin", async () => {
    const user = await getTestPrisma().user.create({ data: { role: "user" } });
    const req = makeRequest("POST", "/api/sources", { userId: user.id, body: { /* … */ } });
    const { status } = await invoke(create, req);
    expect(status).toBe(403);
  });
});
```

---

## 7. Functioneel testplan

Eindgebruiker-perspectief: élk flow moet vanaf de UI uitvoerbaar zijn.

| Flow | Pagina | Manuele acceptatie |
| --- | --- | --- |
| Browse listings + filter | `/listings` | filters synchroniseren met URL · paginering werkt · empty-state bij geen resultaat |
| Detail bekijken | `/listings/[id]` | foto-gallerij · score-breakdown · "Bekijk origineel" opent in nieuw tabblad |
| Bijzondere objecten | `/listings/special` | gegroepeerd op type · alleen `isSpecialObject=true` |
| Bewaarde advertenties | `/listings/saved` | toont alléén kind=saved van current user |
| Kaart-filter | `/map` | sidebar-filter werkt · pin-klik opent detail-drawer · 350km cirkel zichtbaar |
| Source registry | `/sources` | activeer-knop disabled tot legal=green |
| Review queue | `/review` | classification-buckets correct · approve/reject + Discovery form |
| Alerts beheren | `/alerts` | form valideert criteria-JSON · enable-toggle persistert |
| Meldingen | `/notifications` | KPI-cards bucketed · "Gelezen" markeert acknowledged · price-drop toont %  |
| Login | `/login` | cookie wordt gezet · UI toont actieve user |

---

## 8. Technisch testplan

| Laag | Hoe | Frequentie |
| --- | --- | --- |
| Unit | Vitest in CI op élke push (`pnpm test`) | < 5s totaal |
| Integration | Vitest met `TEST_DATABASE_URL` (testcontainers in CI) | < 60s |
| Type-check | `pnpm typecheck` (strict mode) | élke push |
| Lint | `pnpm lint` | élke push |
| Build | `pnpm build` (Next.js) | élke push |
| E2E | Playwright tegen `pnpm dev` (fase 8) | élke PR |
| Performance | `EXPLAIN ANALYZE` op key queries (fase 8) | wekelijks |

CI-config bestaat nog niet — roadmap. Lokale equivalent:

```powershell
pnpm prisma generate
pnpm typecheck
pnpm lint
pnpm test
$env:TEST_DATABASE_URL = "postgresql://radar:radar@localhost:5432/renovation_radar_test"
pnpm test:integration
pnpm build
```

---

## 9. Gaps + roadmap

| Gap | Fase | Status |
| --- | --- | --- |
| E2E Playwright suite | 8 | Open — 10 scenarios staan in sectie 4, wachten op Playwright setup |
| Performance benchmarks | 8 | **✓ scaffold** in [`tests/perf/dashboard-queries.bench.ts`](../tests/perf/dashboard-queries.bench.ts) — production-load tests volgen na seedscript |
| BullMQ worker tests | 5 | Open |
| LLM extractor tests | 5 | **✓ stub-test** in [`extractors/llm.test.ts`](../src/server/normalization/extractors/llm.test.ts) — echte impl + snapshot tests fase 5+ |
| Deduplication engine | 5 | Open — fingerprint-dedup werkt; fuzzy cross-source nog niet |
| Real email delivery | 5 | Open |
| Webhook HMAC + retry | 5 | Open |
| Frontend filter-form interactions | 8 | **✓ opgelost** in [`listing-filters.test.tsx`](../src/components/listings/listing-filters.test.tsx) (5 tests, URL-sync) |
| Empty/Error state components | 8 | **✓ opgelost** in [`empty-state`](../src/components/states/empty-state.test.tsx) + [`error-state`](../src/components/states/error-state.test.tsx) (10 tests) |
| CSRF protection | 8 | Pending — komt met echte NextAuth integratie |
| GDPR right-to-erasure flow | 8 | Open |
| CI pipeline | 8 | **✓ opgelost** in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — typecheck + lint + unit + integration (Postgres+PostGIS service) + build |
| Discovery API integration | 4 | **✓ opgelost** ([`discovery.integration.test.ts`](../tests/api/discovery.integration.test.ts)) |
| Geocoding API integration | 4 | **✓ opgelost** ([`geocoding.integration.test.ts`](../tests/api/geocoding.integration.test.ts)) |
| Alerts API integration + service hooks | 4 | **✓ opgelost** ([`alerts`](../tests/api/alerts.integration.test.ts) + [`notifications`](../tests/api/notifications.integration.test.ts) + [`alert-hooks`](../tests/api/alert-hooks.integration.test.ts)) |
| Connector placeholders (Api/Html/Email) | 4 | **✓ opgelost** ([`placeholders.test.ts`](../src/server/connectors/placeholders.test.ts)) |
| recalculateAllScores batch | 4 | **✓ opgelost** ([`scoring-batch.test.ts`](../src/server/services/scoring-batch.test.ts)) |

---

## 10. Test-fixtures + helpers

Plaats voor herbruikbare testdata:

| Bestand | Inhoud |
| --- | --- |
| [`tests/helpers/test-db.ts`](../tests/helpers/test-db.ts) | `describeIntegration`, `withIntegrationDb`, `resetDatabase`, `getTestPrisma` |
| [`tests/helpers/request.ts`](../tests/helpers/request.ts) | `makeRequest()` + `invoke()` voor route-handler invocation |
| [`prisma/data/`](../prisma/data/) | Search profile + source + listing fixtures (gebruikt door seed) |
| [`tests/seed-data.test.ts`](../tests/seed-data.test.ts) | Statische contract-tests op de fixtures |

Nieuwe testbestanden uit dit plan:

- [`tests/security/auth-rbac.integration.test.ts`](../tests/security/auth-rbac.integration.test.ts) — endpoint × role matrix
- [`tests/legal/guardrails.test.ts`](../tests/legal/guardrails.test.ts) — statische contracts op juridische rails

---

## 11. Eindcontract

Twee invarianten die bij élke release moeten gelden:

1. **`pnpm test` slaagt in < 10s zonder DB.** Élke test die langer duurt of
   externe afhankelijkheden vereist staat achter `describeIntegration` of
   wordt `test.skip()`'d in de unit-suite.

2. **Een bron met `status != active` OR `legalStatus != green` levert NUL
   HTTP-requests op.** Dit is de juridische hoofdcontract. Getest in
   [`runner.test.ts`](../src/server/connectors/runner.test.ts) (legal gate
   refusal) en in [`guardrails.test.ts`](../tests/legal/guardrails.test.ts)
   (statisch op seed-data).

Als één van beide breekt: release blokkeren tot fix.
