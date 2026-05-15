# Geocoding & Distance Engine

Resolves addresses to lat/lng + distance from Venlo, with confidence
information and DB-backed caching so external geocoder hits stay cheap.

> Pipeline: `query → cache → primary provider → fallback (region centroid)
> → write ListingLocation`. PostGIS auto-computes the straight-line
> distance via a trigger on `(lat, lng)` updates.

---

## Schema additions

```prisma
enum DistanceType        { straight_line  driving  estimated }
enum DistanceConfidence  { high  medium  low }

model ListingLocation {
  // existing: lat, lng, location (PostGIS), distanceFromVenloKm, accuracy,
  //           geocoderSource, geocodedAt
  distanceDrivingKm   Float?
  distanceType        DistanceType       @default(straight_line)
  distanceConfidence  DistanceConfidence @default(low)
}

model GeocodeCache {
  queryHash    String  @unique  // sha256 of normalised query
  query        String           // denormalised for debugging
  lat, lng, accuracy, provider, confidence, rawResponse
  hits         Int
}
```

Run `pnpm prisma migrate dev` to apply.

---

## How distance is computed

Two columns, two meanings:

| Column | Set by | Type |
| --- | --- | --- |
| `distanceFromVenloKm` | **PostGIS trigger** on lat/lng change | straight-line |
| `distanceDrivingKm` | optional driving provider (OSRM/Mapbox) | road |

`distanceType` is the SEMANTIC label for the UI:
- `straight_line` — exact point, haversine distance is meaningful
- `estimated` — point came from a region centroid; the distance is approximate
- `driving` — set when the dashboard should prefer the driving figure

`distanceConfidence` (high/medium/low) is independent of `distanceType` and
captures how much you should trust the underlying coordinates.

| Address completeness | Provider type | Confidence |
| --- | --- | -: |
| street + postal + city, geocoder=rooftop | nominatim | **high** |
| postal + city, geocoder=address | nominatim | **high** |
| city only | nominatim (capped) | **medium** |
| region only | estimated_region | **low** |

Confidence is always capped by the QUERY's own upper bound — a provider
claiming "high" for a city-only query will be downgraded to medium, because
geocoder confidence can't exceed what the input supports.

---

## Module layout

```
src/server/geocoding/
├── types.ts                  # GeocodeQuery / Result / Provider / Outcome
├── errors.ts                 # InsufficientAddress / NotFound / ProviderFetchError
├── normalize.ts              # hashQuery, normalisedQueryString, queryUpperBoundConfidence
├── region-centroids.ts       # FR/BE/DE/NL region centroid lookup (case + accent insensitive)
├── cache.ts                  # GeocodeCache + NoopCache
├── distance.ts               # straightLineDistanceKmFromVenlo + driving providers
├── providers/
│   ├── manual.ts             # admin-supplied lat/lng → high confidence
│   ├── nominatim.ts          # OSM Nominatim integration
│   ├── estimated-region.ts   # centroid fallback
│   └── mock.ts               # tests
├── engine.ts                 # geocodeListing() + geocodePending() + writeOutcome
├── index.ts                  # barrel
└── *.test.ts                 # 36 tests
```

---

## Engine pipeline

```
geocodeListing(listingId)
       │
       ▼  load listing.country / region / city / postalCode / addressLine
       │
       ▼  queryUpperBoundConfidence(query)
       │
       ├── none → return { status: 'insufficient_address' }  (no DB write)
       │
       ▼  cache.get(query)
       │
       ├── hit → driving.drivingKm() → upsert ListingLocation → return { status: 'from_cache' }
       │
       ▼  primary.geocode(query)         // default: NominatimProvider
       │
       ├── throw → cache.set(query, null) → return { status: 'fetch_failed' }
       │
       ▼  if null → fallback.geocode(query)  // EstimatedRegionProvider
       │
       ├── still null → cache.set(query, null) → return { status: 'not_found' }
       │
       ▼  cache.set(query, result)
       │
       ▼  driving.drivingKm() (best-effort, swallowed on failure)
       │
       ▼  upsert ListingLocation
       │     (PostGIS trigger fills `location` + `distanceFromVenloKm` from lat/lng)
       │
       ▼  return { status: 'geocoded' | 'estimated_from_region' }
```

`geocodePending({ limit, onlyMissing, delayMs })` cursors over listings
without a `ListingLocation` row and applies `geocodeListing` to each.
Default `delayMs=1100` honours Nominatim's 1 req/sec policy. Cache hits
and skipped outcomes don't sleep.

---

## Providers

### NominatimProvider — default primary

Uses OpenStreetMap's free Nominatim API. Required:

- **User-Agent** with app identifier + contact email (per usage policy).
- **Rate limit** ≤ 1 request/second.
- **Caching** mandatory — we honour this via `GeocodeCache`.

```ts
new NominatimProvider(transport, {
  userAgent: "RenovationRadar/0.1 (+contact: admin@example.com)",
  baseUrl: "https://nominatim.openstreetmap.org", // optional override
});
```

The provider uses structured queries (`?street=...&city=...&postalcode=...`)
when address components are split out, falling back to free-text `q=` when
only a region is given. Country is always restricted via `countrycodes=`.

Accuracy mapping:

| Nominatim `addresstype`/`type` | Our `accuracy` |
| --- | --- |
| house, building | rooftop |
| road, street | address |
| postcode | postal_code |
| city, town, village, municipality | city |
| state, county, region | region |

### EstimatedRegionProvider — fallback

Looks up a region centroid in [`region-centroids.ts`](../src/server/geocoding/region-centroids.ts).
Tables cover the brief's target area: FR (Lorraine, Champagne-Ardenne,
Ardennes, Picardie, Hauts-de-France, …), BE (Wallonie, Liège, Namur,
Hainaut, Luxembourg belge, Vlaanderen), DE (Eifel, Rheinland-Pfalz,
Saarland, NRW, Niederrhein, Sauerland, Niedersachsen, Hessen), NL (Limburg).

Matches are case + accent insensitive with substring fallback so
"Région Grand Est" still finds "grand est".

Output: `distanceType=estimated`, `distanceConfidence=low`. Always.

### ManualProvider

Wraps a sync lookup that returns `{ lat, lng }`. Used by API handlers that
already have coordinates (e.g. admin form) but want the pipeline to write
the cache + ListingLocation.

### MockProvider — tests

Deterministic results from a closure. The default for engine integration
tests.

---

## Driving distance (optional)

`DrivingDistanceProvider` interface with three impls:

| Provider | Behaviour |
| --- | --- |
| `NullDrivingProvider` (default) | always returns null → `distanceDrivingKm` stays empty |
| `OsrmDrivingProvider` (stub) | throws `GeocoderNotImplementedError` until wired |
| `MockDrivingProvider` | for tests; returns a closure-supplied value |

Recommended composition for fase 5+:
1. Run a self-hosted OSRM instance with the EU-West extract.
2. Implement `OsrmDrivingProvider.drivingKm()` to call
   `GET /route/v1/driving/{from};{to}?overview=false` and parse
   `routes[0].distance / 1000`.
3. Wire into the engine via the `driving` dependency.

Driving distance is computed AFTER the primary geocode succeeds and is
**non-fatal**: any error in the driving provider is caught and the
listing still gets persisted with the straight-line distance only.

---

## Caching

`GeocodeCache` is keyed by `sha256(normalisedQueryString(query))`. The
normalised string is:

```
COUNTRY|region|city|postal|address_line   (each part lowercased, accent-stripped, alnum-only, whitespace-collapsed)
```

- **Hits** increment `geocode_cache.hits` (best-effort, never blocks).
- **Negative cache**: when the primary provider returns null or throws,
  we still write an entry with `lat=null, provider='negative'`. Next call
  for the same query returns null from cache without hitting the provider.
- **Refresh**: not automatic. The admin can re-trigger via
  `POST /api/listings/:id/geocode` and the cache row is overwritten on
  upsert.

The cache is global across listings — multiple listings with the same
address share a single cache entry.

---

## API endpoints

`POST /api/listings/:id/geocode` (admin) — runs the engine for one listing,
returns the `GeocodeOutcome`:

```json
{
  "listingId": "uuid",
  "status": "geocoded",
  "lat": 49.1, "lng": 6.1,
  "distanceFromVenloKm": 245.3,
  "distanceDrivingKm": null,
  "distanceType": "straight_line",
  "distanceConfidence": "high",
  "provider": "nominatim",
  "evidence": "nominatim: match. Bron-confidence=high, accuracy=rooftop, capped door query op high."
}
```

`POST /api/geocoding/run-pending` (admin) — batch over listings without a
`ListingLocation` row. Body:

```json
{ "limit": 100, "onlyMissing": true, "delayMs": 1100 }
```

Returns counters: `processed / succeeded / fromCache / estimated / skipped / failed`.

---

## Tests — 36 deterministic cases

| File | Tests | Covers |
| --- | -: | --- |
| `normalize.test.ts` | 8 | hash determinism, case/accent insensitivity, queryUpperBoundConfidence levels |
| `region-centroids.test.ts` | 7 | exact + accent + substring match, country-scoped tables, "Atlantis" returns null |
| `nominatim.test.ts` | 6 | empty result, rooftop=high, city query caps confidence, importance-based pick, JSON + transport errors |
| `distance.test.ts` | 5 | Venlo→Venlo=0, Brussels→Venlo ~130 km, Null/Osrm/Mock driving providers |
| `engine.test.ts` | 8 | insufficient → no write · primary success · fallback to centroid · throw → fetch_failed + negative cache · cache hit short-circuits · confidence capped by query · driving distance written · driving failure doesn't sink |
| `engine.test.ts` (driving) | 2 | (counted above) |

```powershell
pnpm test src/server/geocoding
```

---

## Sample data

The 11 seed listings (see `prisma/data/listings.ts`) get geocoded
automatically by the seed: lat/lng are set explicitly, the PostGIS trigger
fills `location` + `distanceFromVenloKm`, and the new
`distanceType=straight_line` + `distanceConfidence=high|medium` fields are
populated based on whether postal code + addressLine are present.

The listing outside the 350 km radius (Cherbourg lighthouse) still
geocodes — it's the dashboard's filter, not the geocoder, that excludes it.

---

## Adding a new provider

1. Implement `GeocoderProvider` in
   `src/server/geocoding/providers/<name>.ts`. Return `null` for "not
   found"; throw `ProviderFetchError` for transport/parse failures.
2. Wire it as the engine's `primary` dependency in tests, or replace the
   default in `engine.ts`'s `defaultDeps()` when you want it as the
   project-wide default.
3. The cache + confidence cap + region-fallback + driving-distance flow
   all keep working — the engine treats every provider uniformly.

The Nominatim implementation is the reference. ~80 lines including the
parser; copy-paste-modify for a new provider.
