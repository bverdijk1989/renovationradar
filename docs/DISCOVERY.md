# Agency Discovery Engine

Finds local real-estate agency websites in FR / BE / DE, classifies them,
extracts public contact info, and queues them for human review.

> Pipeline: `provider` → `robots.txt check` → `fetch` → `classify` → `extract`
> → `persistCandidate` → `Source (status=pending_review)` + `SourceReview`
> + `AuditLog`. **Nothing is ever auto-activated.**

---

## Architecture

```
src/server/discovery/
├── types.ts               # DiscoveryProvider interface + Candidate + result
├── errors.ts              # RobotsBlockedError / FetchFailedError / ...
├── query-generator.ts     # Deterministic FR/NL/DE query lists per (country, region)
├── robots.ts              # Hand-rolled robots.txt parser + checkRobots()
├── classifier.ts          # rule-based: real_estate_agency / portal / irrelevant / unknown
├── extractor.ts           # name, language, email (mailto only), phone (tel only), listing URL
├── persist.ts             # write Source + SourceReview + AuditLog (idempotent)
├── engine.ts              # public discoverAgencies()
├── providers/
│   ├── manual-import.ts   # admin pastes URLs → working production path
│   ├── search-api.ts      # placeholder (Bing/Brave/SerpAPI later)
│   └── mock.ts            # tests
├── index.ts
└── *.test.ts              # 38 tests
```

---

## The contract — `DiscoveryProvider`

```ts
interface DiscoveryProvider {
  readonly name: string;
  discover(input: DiscoveryInput): Promise<RawCandidate[]>;
}

type DiscoveryInput = {
  country: Country;
  language: Language;
  region?: string | null;
  queries: string[];              // generated for the provider
  providerInput?: Record<string, unknown>;
};

type RawCandidate = {
  url: string;
  discoveryReason: string;        // "Found via query 'agence immobilière Lorraine'"
  preExtracted?: { name?, language?, region? };
};
```

Providers stay small: just turn the input into URL candidates. The engine
does the heavy lifting (robots, fetch, classify, extract, persist).
**Providers MUST NOT touch the database** — that's `persist.ts`'s job.

---

## Working providers

### ManualImport (production path today)

The admin pastes a list of URLs into the review-page form, or
`POST /api/discovery/run` with:

```json
{
  "country": "FR",
  "language": "fr",
  "region": "Lorraine",
  "provider": "manual_import",
  "providerInput": {
    "urls": [
      "https://agence-vieuxmoulin.fr/",
      "https://immobilier-rural.fr/"
    ]
  }
}
```

The engine takes it from there. Bad URLs are dropped silently
(reported as `candidatesSkipped`).

### Mock (tests / dev)

```ts
new MockProvider([
  { url: "https://x.fr/", discoveryReason: "fixture" },
]);
```

Returns a fixed list regardless of input. Useful for engine integration tests.

### SearchApi (placeholder)

Throws `ProviderNotImplementedError`. Wire to Bing / Brave / SerpAPI later.
Recommended composition:
1. For each query → call the search API, country-restricted.
2. Take top organic results, skip ads + news + knowledge cards.
3. Pre-filter known portal domains (see `classifier.ts`).
4. Return one RawCandidate per remaining URL, quoting the query in
   `discoveryReason` so the human reviewer sees WHY it was found.

---

## CSV bulk-import

`POST /api/discovery/import-csv` (admin) — upload een CSV met URLs en de
engine doet de robots.txt-check + classify + persist voor élke regel,
gegroepeerd per (country, language, region) zodat verschillende rijen
verschillende taal-defaults krijgen.

### CSV-formaat

Header rij optioneel (single-column URL list werkt zonder). Comma OF
puntkomma als delimiter (European Excel = `;`). UTF-8 met of zonder BOM.

| Kolom | Verplicht | Synoniemen | Opmerking |
| --- | :-: | --- | --- |
| `url` | ✓ | `website`, `link` | http(s) only |
| `country` | | `land`, `pays` | `FR` / `BE` / `DE` / `NL` |
| `language` | | `taal`, `langue` | `fr` / `nl` / `de` / `en` |
| `region` | | `regio` | vrije tekst |
| `note` | | `notes`, `opmerking` | komt in `discoveryMeta` |

Voorbeeld in [docs/examples/sources.example.csv](./examples/sources.example.csv):

```csv
url,country,language,region,note
https://agence-rural.fr/,FR,fr,Lorraine,"Voorbeeld"
https://makelaar-namur.be/,BE,fr,Namur,
https://immobilien-eifel.de/,DE,de,Eifel,"Sanierungsbedürftige Häuser"
```

### Workflow

1. Admin uploadt CSV via de form op `/review` (sectie "CSV-import").
2. **Voorbeeld** (dryRun=true) — toont parsed rijen + groepering, géén
   HTTP-calls, géén DB-schrijven. Validatie-fouten per regel in beeld.
3. **Importeren** (dryRun=false) — engine draait per groep
   (`discoverAgencies({ country, language, region, urls })`), persists
   sources als `pending_review`, schrijft AuditLog.

### Limieten

- Max **50 URLs per upload** — anders krijgt de HTTP-request een
  Nginx-timeout (60s). Voor grotere imports → splits de CSV, of wacht op
  fase 5+ BullMQ workers.
- Max **1 MB** bestandsgrootte.

### Programmatic / CLI

```bash
curl -X POST https://renovationradar.aegiscore.nl/api/discovery/import-csv \
  -H "Cookie: dev-user-id=<admin-uuid>" \
  -F "file=@my-sources.csv" \
  -F "defaultCountry=FR" \
  -F "defaultLanguage=fr" \
  -F "dryRun=true"
```

`dryRun=true` retourneert de parse-summary + groepen zonder DB-mutaties.
Verwijder de flag om écht te draaien.

---

## Engine pipeline

```
provider.discover(input)
       │
       ▼  for each candidate URL:
   ┌──────────────────────┐
   │ checkRobots(url, UA) │
   └──────────┬───────────┘
              │
       ┌──────┴──────┐
       │             │
   allowed       disallowed
       │             │
       ▼             ▼
   fetch HTML    skip fetch (classification stays 'unknown',
       │         robotsAllowed=false, still surfaces in queue)
       │
       ▼
   classify(url, html)
       │
       ▼
   extract(url, html)
       │
       ▼
   persistCandidate(...)
       │
       ├─ Source.findFirst by website → already exists?
       │      yes → return {created:false} (counted as 'skipped_existing')
       │      no  → continue
       │
       ├─ Source.create({
       │      status: 'pending_review',          ← never active
       │      legalStatus: 'pending_review',     ← never green
       │      classification: <resolved>,
       │      discoveryMeta: { provider, reason, evidence, extracted, ... },
       │   })
       │
       ├─ SourceReview.create({
       │      evidenceUrl: candidate.finalUrl,
       │      legalStatusAfter: 'pending_review',
       │      notes: 'Found via <provider>; classification: <X>; evidence: ...',
       │   })
       │
       └─ AuditLog action=discovery_run, entityType=source, entityId=<id>
```

The result is a `DiscoveryRunResult` summary returned to the admin:

```json
{
  "queriesGenerated": 23,
  "candidatesFetched": 4,
  "candidatesPersisted": 2,
  "candidatesSkipped": 2,
  "reasons": { "skipped_existing": 1, "robots_blocked": 0, "fetch_failed": 1 },
  "candidates": [
    { "sourceId": "uuid-1", "url": "https://...", "classification": "real_estate_agency", "skipped": false },
    ...
  ]
}
```

---

## Classification rules

Three signal sources, scored and combined:

1. **Domain rule** — host in a known-portal list → `portal` (+6).
   Portals included: leboncoin/seloger/pap/bienici/logic-immo (FR);
   immoweb/zimmo/immovlan/hebbes (BE); immobilienscout24/immowelt/immonet/
   kalaydo/kleinanzeigen/ohne-makler (DE); funda/jaap (NL).

2. **Keyword rules** — scan title + first 5kB of body for:
   - agency keywords: "agence immobilière", "makelaar", "vastgoedkantoor",
     "Immobilienmakler", "Immobilienbüro"
   - portal signals: "milliers d'annonces", "duizenden advertenties",
     "tausende Immobilien"
   - irrelevant signals: "ajouter au panier", "in den Warenkorb", domain parking

3. **Structural heuristics** — `mailto:` link (+1 agency); >40 `<option>`
   tags (+2 portal, suggests big filter UI); explicit price-range filter
   (+1 portal).

Tie-break order: `portal > real_estate_agency > irrelevant`. Confidence
is `winner_score / max(3, total_score)`.

When nothing fires: `unknown` with confidence 0. The reviewer decides.

---

## Extracted metadata — conservative on contact info

The brief says "indien zakelijk en publiek". The extractor is intentionally
strict:

- **Name** — `<meta property="og:site_name">` → `<title>` minus suffix → hostname fallback.
- **Language** — `<html lang>` → `<meta http-equiv="content-language">` → null.
- **Email** — only `mailto:` links (never scraped from page text). Prefers
  same-domain role addresses (`info@`, `contact@`, `office@`, ...).
- **Phone** — only `tel:` links (never parsed from loose digits in text).
- **Listing-page URL** — `<a href>` matching `/annonces`, `/biens`,
  `/immo`, `/aanbod`, `/te-koop`, `/objekte`, `/listings`, etc.
- **Region** — `<meta name="geo.region">` or first `<address>` block.

Why so conservative? Misattributing a personal-looking address would be
a privacy / professional-courtesy violation. False negatives (admin
fills it in later) are recoverable; false positives aren't.

---

## Legal rails

### robots.txt — fail closed

The engine fetches `https://<host>/robots.txt` BEFORE the target URL.
Decision rules:
- HTTP 404 → "no robots.txt" → allowed (per spec).
- Network error / 5xx → **DISALLOWED** (fail closed). Better to skip than
  crawl by mistake.
- Matched `User-agent` group's longest-matching `Disallow` rule wins.

Robots-blocked candidates STILL appear in the review queue (with
`classification=unknown`, `robotsAllowed=false`, evidence captured in
`discoveryMeta`). A human can then decide whether to negotiate access or
remove the source manually.

### Never auto-activate

Every persisted Source row starts with:
- `status='pending_review'`
- `legalStatus='pending_review'`
- `collectionMethods` set to `['scrape_with_permission']` for agencies or
  `['manual_entry']` for portals / irrelevant — both require explicit
  human re-classification before the connector framework will run.

The runner (`src/server/connectors/runner.ts`) double-checks at crawl time:
`legalStatus !== 'green'` → `LegalGateError`. So even if a discovery row
somehow leaked an "active" status, the connector framework would still
refuse to fetch.

### Audit trail

Every `discoverAgencies()` run produces:
- 1 `AuditLog` row per persisted Source (`action=discovery_run`).
- 1 `SourceReview` row per persisted Source (evidence URL + reason).
- Plus 1 `AuditLog` row from the API handler summarising the whole run.

---

## API

`POST /api/discovery/run` — admin-only

```json
{
  "country": "FR",
  "language": "fr",
  "region": "Lorraine",
  "provider": "manual_import",
  "providerInput": { "urls": "https://x.fr\nhttps://y.fr" }
}
```

Returns the `DiscoveryRunResult` summary. The newly-created sources are
immediately visible in `/review`.

---

## Admin Review UI

Extended in fase 4 deel 4:
- **Discovery form** at the top of `/review` — admin enters country/language/
  optional region + paste URLs → triggers `POST /api/discovery/run`.
- **Classification buckets** — 4 KPI cards (Makelaarskantoor /
  Vastgoedportal / Niet relevant / Onbekend) with counts.
- **Per-source cards** show classification badge + confidence %, the
  discovery reason, expandable classification evidence, extracted public
  contact info, and robots.txt evidence.

---

## Tests — 38 cases

| File | Tests | Covers |
| --- | -: | --- |
| `query-generator.test.ts` | 6 | per-language templates, default regions, determinism, dedup |
| `robots.test.ts` | 9 | empty/explicit Disallow, longest-match wins, UA group selection, 404 → allowed, fail-closed |
| `classifier.test.ts` | 8 | portal domains, agency keywords, NL/DE keywords, sub-domain portal, irrelevant signals, no-signal → unknown |
| `extractor.test.ts` | 9 | og:site_name, title fallback, language, mailto-only email, tel-only phone, listing URL detection |
| `manual-import.test.ts` | 6 | string / array / dedup / filter non-http / reason / throws on missing input |
| `engine.test.ts` | 6 | happy path persists pending source, robots-block skips fetch but still persists, existing source skipped, fetch fail recorded, queriesGenerated reported, portal classification |

```powershell
pnpm test src/server/discovery
```

---

## Adding a new provider

1. Create `src/server/discovery/providers/<name>.ts` exporting a class that
   implements `DiscoveryProvider`. Return `RawCandidate[]` — just URLs and a
   discoveryReason. Don't fetch HTML, don't write to the DB.

2. Register it in `src/app/api/discovery/run/route.ts` (extend the
   `provider` enum and the switch in the handler).

3. Add it to the `DiscoveryRunSchema` enum in
   `src/server/schemas/discovery.ts`.

4. Write tests with the `MockProvider` pattern: return canned URLs, run the
   engine with a `MockTransport`, assert the resulting `DiscoveryRunResult`.

The legal rails (robots.txt + pending-review status) automatically apply
to every provider via the engine — no provider can bypass them.
