# Connector Framework

Uniform pipeline for pulling listings out of any allowed source — API, RSS,
sitemap, permitted HTML, email newsletter, or human entry.

> Implementation lives in [`src/server/connectors/`](../src/server/connectors/).
> Drives the `CrawlJob` lifecycle and writes to `RawListing` rows.

---

## The interface

```ts
export interface SourceConnector {
  readonly name: string;
  readonly sourceType: SourceType;
  canHandle(source: Source): boolean;
  validateSource(source: Source): Promise<SourceValidationResult>;
  fetchListings(
    source: Source,
    profile: SearchProfile | null,
    ctx: FetchContext,
  ): Promise<RawListingDraft[]>;
}
```

Four contracts. Three of them are pure logic, one (`fetchListings`) does
the I/O. Every implementation receives a `FetchContext` carrying an
`HttpTransport`, a `RateLimiter`, the parent `crawlJobId` and an
`AbortSignal` — so tests inject mocks, production injects real ones.

---

## Layers

```
                ┌───────────────────────────────┐
                │ runConnectorJob(jobId)        │ ← entry point
                │   – legal gate                │
                │   – pickConnector(source)     │
                │   – validateSource()          │
                │   – wait on rate limiter      │
                │   – fetchListings()           │
                │   – dedup + persist           │
                │   – CrawlJob lifecycle        │
                └────────────────┬──────────────┘
                                 │
        ┌────────────────────────┼────────────────────────┐
        ▼                        ▼                        ▼
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│ Manual       │         │ Rss          │         │ Sitemap      │ ← working
└──────────────┘         └──────────────┘         └──────────────┘
┌──────────────┐         ┌──────────────────┐     ┌────────────────┐
│ Api (stub)   │         │ PermittedHtml(s) │     │ EmailNewsletter│ ← placeholder
└──────────────┘         └──────────────────┘     └────────────────┘
```

---

## Legal gate (the runner enforces it)

Before ANY HTTP request is made, the runner checks:

| Condition | Result |
| --- | --- |
| `source.status !== "active"` | `LegalGateError` — job → failed |
| `source.legalStatus !== "green"` | `LegalGateError` — job → failed |
| `source.collectionMethods === ["manual_entry"]` | `LegalGateError` — manual sources flow through `/api/listings/manual`, not the runner |

Only after the gate passes does the runner pick a connector and call
`validateSource()`. If validation returns `ok=false` the runner stops without
fetching anything — same failure path as the legal gate.

---

## Rate limiting

`source.rateLimitPerMinute` is honoured per source by the
`InProcessRateLimiter`. Calls space out enough to respect the budget; if
the required wait exceeds `maxWaitMs` (default 60s) the limiter throws
`RateLimitError` so the worker can yield instead of holding the connection.

Multi-worker deployments will need a Redis-backed limiter exposing the same
`RateLimiter` interface; the runner accepts it via dependency injection.

---

## Raw payload storage

For every accepted item the runner writes a `RawListing` row with:

- the verbatim payload (the connector's JSON encoding of what it received)
- `contentHash = sha256(payload)` so re-fetches of unchanged content dedupe
- `externalId` (RSS `<guid>`, sitemap `<loc>`, API id, …)
- `language` if the connector could detect it
- `_crawlJobId` embedded in the payload for traceability

The unique constraint `(sourceId, contentHash)` makes dedup atomic. A second
crawl of the same feed returns the same items; their unique-violation throws
get counted in `itemsRejected` (not as errors).

`P2002` on `(sourceId, externalId)` is also tolerated for the same reason.

---

## Built-in connectors

### 1. ManualConnector (`manual.ts`)

`canHandle`: sources whose `collectionMethods` are EXCLUSIVELY `manual_entry`.

`fetchListings`: returns `[]`. Listings flow in via `POST /api/listings/manual`.

Why exist? So the registry can match every source type without throwing
`NoConnectorError`. Validates green legal status and warns if not.

### 2. RssConnector (`rss.ts`)

`canHandle`: `sourceType === "rss"` OR `collectionMethods.includes("rss")`.

Config (on `source.connectorConfig`):
```jsonc
{
  "feedUrl": "https://example.com/feed.xml",
  "language": "fr"   // optional; otherwise picked from feed <language>
}
```

Parses RSS 2.0 (`<item>`) and Atom (`<entry>`). Each item becomes a
RawListingDraft with title, link, description, pubDate, guid, categories,
enclosure URL. Profile-based filtering keeps only items whose title or
description contains at least one of the profile's terms.

### 3. SitemapConnector (`sitemap.ts`)

`canHandle`: `sourceType === "sitemap"` OR `collectionMethods.includes("sitemap")`.

Config:
```jsonc
{
  "sitemapUrl": "https://example.com/sitemap.xml",
  "urlPattern": "/property/",  // optional substring filter on <loc>
  "followIndex": true          // optional; recurses into nested sitemaps
}
```

A sitemap entry is JUST a URL — the connector deliberately does NOT fetch
the underlying page. That belongs to `PermittedHtmlConnector` once it's
implemented and has explicit per-page permission.

Index recursion depth caps at 3 to avoid runaway chains.

### 4. ApiConnector (`api.ts`) — placeholder

`canHandle`: claims `sourceType === "api"`. `validateSource` returns
`ok=false` with a "placeholder" issue. `fetchListings` throws
`NotImplementedError`.

This shape is final so a real implementation drops in without changing the
registry. Recommended composition: subclass `ApiConnector`, override
`fetchListings`, read auth + pagination cursor from `connectorConfig`,
respect rate limiter on every paginated call.

### 5. PermittedHtmlConnector (`html.ts`) — placeholder

`canHandle`: claims `sourceType === "scrape"` OR
`collectionMethods.includes("scrape_with_permission")`.

Naming chosen on purpose: this is NOT a generic web scraper. A concrete
implementation must:
- only run after a recent SourceReview attests to permission
- have a site-specific Cheerio parser
- store stable selectors on `connectorConfig` so layout changes are visible
- respect Retry-After + tight per-page rate limits

### 6. EmailNewsletterConnector (`email.ts`) — placeholder

For sources that arrive as forwarded newsletter emails. Implementation
involves a webhook receiver (Postmark / SES) that drops parsed payloads into
a queue; this connector then drains the queue.

---

## Adding a new connector

1. **Create the file** in `src/server/connectors/<name>.ts` exporting a class
   that implements `SourceConnector`.

   ```ts
   import type { SearchProfile, Source } from "@prisma/client";
   import type {
     FetchContext, RawListingDraft, SourceConnector, SourceValidationResult,
   } from "./types";

   export class MySourceConnector implements SourceConnector {
     readonly name = "mysource-v1";
     readonly sourceType = "api" as const;

     canHandle(source: Source): boolean {
       return source.name === "MySource Open Data";
     }

     async validateSource(source: Source): Promise<SourceValidationResult> {
       const issues: string[] = [];
       const cfg = source.connectorConfig as { apiKey?: string } | null;
       if (!cfg?.apiKey) issues.push("connectorConfig.apiKey is required");
       return { ok: issues.length === 0, issues, warnings: [] };
     }

     async fetchListings(source, profile, ctx): Promise<RawListingDraft[]> {
       // 1. Read connectorConfig.
       // 2. Loop API pages, calling ctx.rateLimiter.wait() between calls.
       // 3. For each row, return { externalId, url, payload, language }.
       return [...];
     }
   }
   ```

2. **Register it** in `src/server/connectors/registry.ts`. Order matters —
   the first connector whose `canHandle()` returns true wins, so put more
   specific connectors before generic ones.

3. **Write a Source registry row** with the connectorConfig the connector
   expects. Set `legalStatus: green` only AFTER a human-recorded
   SourceReview. Activate via `POST /api/sources/:id/activate`.

4. **Test it** with `MockTransport`:

   ```ts
   const drafts = await new MySourceConnector().fetchListings(
     source(),
     null,
     {
       transport: new MockTransport({
         "https://api.example.com/page1": { body: "..." },
       }),
       rateLimiter: new NoopRateLimiter(),
       crawlJobId: "test",
     },
   );
   expect(drafts).toHaveLength(N);
   ```

5. **Add an integration test** for the runner if your connector has unusual
   error paths (auth failures, transient timeouts, …) that should be surfaced
   in `CrawlJob.errorMessage`.

---

## Endpoints

`POST /api/jobs/run-search` — admin enqueues a `queued` CrawlJob. The
green-gate (status=active + legalStatus=green) is enforced HERE so the user
gets immediate feedback rather than a silent failure later.

`POST /api/jobs/:id/execute` — admin runs an already-queued job INLINE.
Useful for dev; the BullMQ worker (fase 5+) will call the same
`executeQueuedJob()` from the queue.

`GET /api/jobs` / `GET /api/jobs/:id` — read the lifecycle, counters,
error messages, attached source + profile.

---

## Failure surface

All failures land in `CrawlJob.errorMessage` as
`"<code>: <human message>"`. Codes:

| Code | Meaning |
| --- | --- |
| `legal_gate_blocked` | source not active / not green / manual-only |
| `no_connector` | no connector claims this source |
| `source_validation_failed` | connector said `ok=false` |
| `transport_error` | non-2xx HTTP, timeout, network refused |
| `rate_limited` | required wait exceeds maxWaitMs OR cancelled |
| `parse_error` | malformed XML / JSON |
| `not_implemented` | placeholder connector invoked |

`CrawlJob.meta` carries the typed `details` object the error class produced
(URL, status, missing field, etc.) — surfaced in the admin job-detail UI.

---

## Test coverage

| File | Tests | Covers |
| --- | -: | --- |
| `xml.test.ts` | 6 | tag/attr/block extraction, CDATA, entities, namespaces |
| `manual.test.ts` | 4 | canHandle exclusivity, validation, no-op fetch |
| `rss.test.ts` | 6 | RSS 2.0 + Atom parsing, validation, profile filter, ParseError |
| `sitemap.test.ts` | 4 | urlset, urlPattern filter, index follow on/off |
| `rate-limit.test.ts` | 5 | spacing, per-source, throws on excess, NoopRateLimiter |
| `runner.test.ts` | 8 | legal gate (3), lifecycle (5), dedup, validation refusal, terminal-state guard, crash-recovery |

```powershell
pnpm test src/server/connectors
```
