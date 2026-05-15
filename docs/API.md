# Renovation Radar EU — Backend API (fase 2)

Stack: Next.js 14 App Router route handlers · TypeScript · Prisma · Zod.
All responses are JSON. Mutations require auth.

## Conventions

### Auth

Until fase 3 (NextAuth.js) all auth runs through a dev shim:

```
X-Dev-User-Id: <user UUID>
```

In production builds the header is rejected unless `DEV_AUTH_BYPASS=allow`.

- **Public endpoints** (no auth): `GET /api/listings`, `GET /api/listings/:id`,
  `GET /api/sources`, `GET /api/search-profiles`.
- **Authenticated user**: alerts, save/ignore on listings.
- **Admin role required**: every source mutation, listing create/patch, all
  jobs, scoring endpoints, review queue.

### Error envelope

All errors share the shape:

```json
{
  "error": {
    "code": "validation_failed | unauthorized | forbidden | not_found | conflict | bad_request | internal_error",
    "message": "Human-readable",
    "details": "optional, typed per code"
  }
}
```

Validation errors (`code: validation_failed`) carry an array of Zod issues:

```json
{
  "error": {
    "code": "validation_failed",
    "details": [
      { "path": "country", "code": "invalid_enum_value", "message": "Invalid enum value" }
    ]
  }
}
```

### Pagination

List endpoints accept `?page` (≥ 1, default 1) and `?pageSize` (1–100, default 20).
Responses wrap collections in:

```json
{
  "data": [/* ... */],
  "pagination": { "page": 1, "pageSize": 20, "total": 137, "pageCount": 7 }
}
```

### Filter / sort syntax

- Multi-value enums accept either repeated keys or a CSV string:
  `?country=FR,BE` ≡ `?country=FR&country=BE`.
- Boolean params accept `true`/`false` strings.
- Numbers are coerced.

---

## Sources

### `GET /api/sources`

List sources. **Public.**

Query parameters:

| param | type | notes |
| --- | --- | --- |
| `country` | csv enum | `FR,BE,DE,NL` |
| `status` | csv enum | `active,paused,blocked,retired,pending_review` |
| `legalStatus` | csv enum | `green,amber,red,pending_review` |
| `sourceType` | csv enum | `api,rss,sitemap,manual,email,scrape` |
| `search` | string | ILIKE on name/website/notes |
| `sortBy` | enum | `createdAt` (default) / `updatedAt` / `name` / `lastCheckedAt` |
| `sortDir` | enum | `asc` / `desc` (default) |
| `page`, `pageSize` | int | pagination |

### `POST /api/sources` · **admin**

Body (`SourceCreateSchema`):

```json
{
  "name": "Notarial open data BE",
  "country": "BE",
  "website": "https://example.be/open-data",
  "sourceType": "api",
  "collectionMethods": ["api"],
  "notes": "Verified license CC BY-4.0",
  "rateLimitPerMinute": 30
}
```

New sources always start as `status=pending_review` / `legalStatus=pending_review`,
regardless of what's in the body. Admin must run `/check` (or `/review/sources/:id/approve`)
to move legal status to green, then `/activate`.

### `GET /api/sources/:id`

Returns the source plus its 10 most recent `SourceReview` rows and counts of
`rawListings`, `normalizedListings`, `crawlJobs`.

### `PATCH /api/sources/:id` · **admin**

Body: partial of `SourceCreateSchema` + `status` / `robotsStatus` /
`termsStatus` / `legalStatus`. Rejected with `400` if you try to set
`status=active` while `legalStatus != green`.

### `POST /api/sources/:id/check` · **admin**

Records a new `SourceReview` row and updates the source's robots/terms/legal
status. If `legalStatus` flips to non-green and the source was `active`, it is
**force-paused**.

Body:

```json
{
  "robotsStatus": "allows",
  "termsStatus": "allows",
  "legalStatus": "green",
  "evidenceUrl": "https://web.archive.org/web/20260515/.../tos",
  "notes": "ToS reviewed; API explicitly permits per §4.2"
}
```

### `POST /api/sources/:id/activate` · **admin**

Sets `status=active`. Refuses with `400` if `legalStatus != green` or with
`409` if source is `retired`.

### `POST /api/sources/:id/deactivate` · **admin**

Sets `status=paused`. Refuses with `409` if source is already `retired`.

---

## Listings

### `GET /api/listings`

**Public.** The dashboard's main query.

Query parameters:

| param | type | notes |
| --- | --- | --- |
| `country` | csv enum | `FR,BE,DE,NL` |
| `propertyType` | csv enum | |
| `specialObjectType` | csv enum | |
| `renovationStatus` | csv enum | |
| `electricityStatus`, `waterStatus` | csv enum | |
| `availability` | csv enum | `for_sale,under_offer,sold,withdrawn,unknown` |
| `minPriceEur` / `maxPriceEur` | int | |
| `minLandM2` / `maxLandM2` | int | |
| `minDistanceKm` / `maxDistanceKm` | float | Joins ListingLocation |
| `isSpecialObject` | bool | |
| `isDetached` | enum | `yes`/`no`/`unknown` |
| `minMatchScore` | 0..100 | Joins ListingScore |
| `minCompositeScore` | 0..100 | Joins ListingScore |
| `search` | string | ILIKE on title_nl/title_original/city/address_line |
| `sortBy` | enum | `composite_score` (default) / `match_score` / `price_eur` / `land_area_m2` / `distance_from_venlo_km` / `first_seen_at` / `published_at` |
| `sortDir` | enum | `asc`/`desc` |

Returns: each item includes `location`, `score`, `agency` (id/name/country/website),
`source` (id/name/country/sourceType) and the first `media` (sorted by sortOrder).

Example:

```
GET /api/listings?country=FR,DE&maxPriceEur=200000&minLandM2=10000
                  &maxDistanceKm=350&isSpecialObject=true
                  &sortBy=composite_score&sortDir=desc&pageSize=10
```

### `GET /api/listings/:id`

Returns the full listing: location, score, agency, source, all media,
features, raw listing trace (last 20), and deduplication group members.

### `POST /api/listings/manual` · **admin**

Create a listing manually. The `sourceId` MUST point to a `manual_entry`
source (legal hygiene — the registry is the gate). Duplicate fingerprint
(country + postal_code + address_line + price + land_area_m2) returns `409`
with the existing listing's id.

Required: `sourceId`, `originalUrl`, `titleOriginal`, `language`, `country`.

### `PATCH /api/listings/:id` · **admin**

Partial update. `lat` / `lng` create/update the related `ListingLocation` and
the PostGIS trigger refreshes `distance_from_venlo_km` automatically.

### `POST /api/listings/:id/save` · **user**

Body: `{ "notes": "Optional" }`. Upserts `SavedListing` with `kind=saved`.

### `POST /api/listings/:id/ignore` · **user**

Body: `{ "reason": "Optional" }`. Upserts `SavedListing` with `kind=ignored`.
Saving and ignoring toggle the same row.

---

## Search Profiles

### `GET /api/search-profiles`

**Public.** Filters: `country`, `language`, `category`, `active`.

### `POST /api/search-profiles` · **admin**

```json
{
  "name": "FR · objets ruraux",
  "country": "FR",
  "language": "fr",
  "category": "rural",
  "terms": ["longère", "corps de ferme"],
  "active": true
}
```

### `PATCH /api/search-profiles/:id` · **admin**

Partial update.

---

## Scoring

### `POST /api/listings/:id/score` · **admin**

Recomputes the 5 scores + composite for one listing, upserts `ListingScore`,
and advances the listing's `processingStatus` to `scored`.

### `POST /api/scoring/recalculate` · **admin**

Batch re-score. Body:

```json
{ "listingIds": ["uuid-1", "uuid-2"] }
```

`listingIds` is optional — omit it to rescore everything. Returns
`{ "processed": N, "scorerVersion": "v1" }`.

---

## Jobs

### `POST /api/jobs/run-search` · **admin**

Enqueue a crawl job. Body:

```json
{ "sourceId": "uuid", "searchProfileId": "uuid-or-omit" }
```

Refuses sources that are not `status=active` AND `legalStatus=green`. The
actual BullMQ worker runs in fase 4; today the row is persisted with
`status=queued`.

### `GET /api/jobs` · **admin**

Filters: `sourceId`, `status` (csv). Returns jobs with `source` and
`searchProfile` summaries.

### `GET /api/jobs/:id` · **admin**

Full job detail.

---

## Alerts

### `GET /api/alerts` · **user**

Returns the calling user's alerts. Filter: `enabled` (bool).

### `POST /api/alerts` · **user**

```json
{
  "name": "Watermolens FR/BE binnen 250 km",
  "channel": "email",
  "frequency": "daily",
  "criteria": {
    "country": ["FR", "BE"],
    "isSpecialObject": true,
    "specialObjectType": ["watermill", "mill"],
    "maxPriceEur": 200000,
    "minLandM2": 10000,
    "maxDistanceKm": 250
  }
}
```

The `criteria` shape is the same Zod schema as the `/api/listings` query
parameters (minus pagination / sorting). The matcher (fase 7) reuses the
same SQL builder.

### `PATCH /api/alerts/:id` · **user**

Partial update. Users can only edit their own alerts (others return `404`).

---

## Admin Review

### `GET /api/review/sources` · **admin**

Lists sources in the review queue: `status=pending_review` OR
`legalStatus=pending_review`. Includes the most recent `SourceReview` row.

### `POST /api/review/sources/:id/approve` · **admin**

Approves the source: sets `legalStatus=green`, sets `status=active` (unless
retired), writes a `SourceReview` row with `legalStatusAfter=green`.

Body: `{ "notes": "Optional review note" }`.

### `POST /api/review/sources/:id/reject` · **admin**

Sets `legalStatus=red`, `status=blocked`, writes a `SourceReview` row with
`legalStatusAfter=red`.

### `GET /api/review/listings` · **admin**

Lists `ReviewQueueItem` rows with `status=pending`, including the listing,
its location, score and source.

---

## Audit log

Every mutation writes an `AuditLog` row best-effort (failures don't break the
mutation). Fields recorded: `userId`, `action`, `entityType`, `entityId`,
`meta` (free-form), `ip`, `userAgent`. Surface in a future admin viewer
(fase 6).

`action` enum: `create | update | delete | view | login | logout |
source_check | listing_accepted | listing_rejected | listing_archived |
alert_dispatched | crawl_started | crawl_finished`.

---

## Status codes

| Code | When |
| --- | --- |
| 200 | Success |
| 201 | Resource created |
| 204 | No content (delete-like operations) |
| 400 | Validation failure or business-rule violation (e.g. activate while non-green) |
| 401 | Missing / invalid auth header |
| 403 | Authenticated but not admin |
| 404 | Resource not found |
| 409 | Unique constraint or state conflict (e.g. duplicate listing fingerprint) |
| 500 | Unhandled — logged server-side |

---

## End-to-end example: onboard a new source and run it

```
# 1. Create
POST /api/sources
X-Dev-User-Id: <admin>
{ "name": "Test feed", "country": "FR", "website": "https://x.fr",
  "sourceType": "rss", "collectionMethods": ["rss"] }

# 2. Review (legal check with evidence)
POST /api/sources/<id>/check
X-Dev-User-Id: <admin>
{ "robotsStatus": "allows", "termsStatus": "allows", "legalStatus": "green",
  "evidenceUrl": "https://web.archive.org/..." }

# 3. Activate
POST /api/sources/<id>/activate

# 4. Queue a crawl
POST /api/jobs/run-search
{ "sourceId": "<id>" }
```
