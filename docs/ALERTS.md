# Alerts Engine

Per-user saved searches that fire on listing lifecycle events. Three event
types, four channels, dedup by `(alert × listing × event-type)`, daily +
weekly digest scheduling.

> Realtime path: `evaluateListingEvent` hooked into listings/scoring
> service paths. Batch path: `runDigest('daily' | 'weekly')` driven by a
> cron / BullMQ scheduler (fase 5+).

---

## Schema additions

```prisma
enum NotificationEventType {
  new_match               // a listing matching the criteria appeared
  price_drop              // price went DOWN
  score_increased         // composite score went UP
  special_object_added    // matching + isSpecialObject=true
}
enum NotificationStatus { pending dispatched acknowledged failed }
enum AlertChannel { email web_push in_app webhook }  // +webhook this fase

model AlertNotification {
  alertId, normalizedListingId, userId
  eventType, channel, status
  payload Json            // matchedReasons + price diff + score jump
  createdAt, dispatchedAt, acknowledgedAt, failureReason
  @@unique([alertId, normalizedListingId, eventType])
  @@index([userId, status, createdAt desc])
}
```

Run `pnpm prisma migrate dev` to apply.

---

## Criteria — every brief item covered

The `AlertCriteriaSchema` extends `ListingListQuerySchema` (the dashboard's
filter) with event-specific knobs:

| Brief item | Criterion |
| --- | --- |
| nieuwe matches | `eventTypes: ['new_match']` (default) |
| nieuwe bijzondere objecten | `eventTypes: ['special_object_added']` OR `isSpecialObject: true` + new_match |
| prijsverlaging | `eventTypes: ['price_drop']` + optional `minPriceDropEur` / `minPriceDropPercent` |
| match score boven X | `minMatchScore: X` |
| nieuw object binnen X km | `maxDistanceKm: X` |
| specifieke objecttypes | `specialObjectType: ['watermill','mill',…]` |
| land / regio | `country: ['FR','BE','DE']` (region via `search` keyword) |
| grondoppervlak | `minLandM2`, `maxLandM2` |
| renovatiestatus | `renovationStatus: ['needs_renovation','ruin']` |

Plus the standard fields: `propertyType`, `electricityStatus`, `waterStatus`,
`availability`, `isDetached`, `minPriceEur`, `maxPriceEur`, `minDistanceKm`,
`minCompositeScore`, `search`.

---

## Module layout

```
src/server/alerts/
├── types.ts              # ListingEvent, MatchResult, DeliverableNotification, EvaluationSummary
├── matcher.ts            # PURE: match(alert, listing, event) → MatchResult
├── evaluator.ts          # Realtime: query alerts, run matcher, create+dispatch
├── digest.ts             # Batch: runDigest('daily' | 'weekly')
├── delivery/
│   ├── in-app.ts         # working — row IS the in-app artifact
│   ├── email.ts          # placeholder (Resend/Postmark/SES in fase 5+)
│   ├── webhook.ts        # placeholder (HMAC-signed POST + retries)
│   └── dispatcher.ts     # routes channel + persists status
├── engine.ts             # public API: evaluateListingEvent, runDigest, acknowledge, list
├── index.ts
└── *.test.ts             # 35+ tests
```

---

## Engine entry points

```ts
// Realtime — called by listings + scoring service paths
evaluateListingEvent(event: ListingEvent): Promise<EvaluationSummary>

// Batch — called by cron / BullMQ scheduler
runDigest({ frequency: 'daily' | 'weekly', alertId? }): Promise<DigestSummary>
runDailyDigest()    // sugar
runWeeklyDigest()   // sugar

// Operations
dispatchPending(limit?)               // retry any status=pending rows
acknowledgeNotification(userId, id)   // user marks read

// Listing API
listUserNotifications(userId, { status?, limit? })
```

`ListingEvent` shapes:

```ts
{ type: 'new_match',            listingId }
{ type: 'special_object_added', listingId }
{ type: 'price_drop',           listingId, previousPriceEur }
{ type: 'score_increased',      listingId, previousCompositeScore }
```

---

## Where events fire (already wired)

| Service path | Event |
| --- | --- |
| `manualCreateListing()` succeeds | `new_match` (+ `special_object_added` if applicable) |
| `patchListing()` with lower `priceEur` | `price_drop` (carries `previousPriceEur`) |
| `scoreListingById()` with higher `compositeScore` | `score_increased` |

All hooks are wrapped in try/catch so a flaky alerts table can never sink
a listing mutation. The connector framework (fase 4) writes RawListings
which only become NormalizedListings via a separate fase-5+ pipeline;
when that lands, the same `evaluateListingEvent` hook applies.

---

## Realtime evaluation algorithm

```
evaluateListingEvent(event)
  │
  ▼  load listing + location + score
  │
  ▼  query all enabled alerts (in-memory matcher → cheap)
  │
  ▼  for each alert:
  │      match(alert, listing, event)
  │           │
  │           ├── no → reason logged, skip
  │           ▼
  │       AlertNotification.create({status: pending, payload})
  │           │
  │           ├── P2002 unique violation → skippedDuplicates++  (dedup)
  │           ▼
  │       if alert.frequency === 'instant':
  │           dispatcher.dispatch(notification)
  │              → channel handler returns ok/fail
  │              → row.status = dispatched | failed
  │
  ▼  return EvaluationSummary { evaluatedAlerts, matched, created,
                                skippedDuplicates, dispatched, failed }
```

The unique constraint `(alertId, normalizedListingId, eventType)` is the
single source of truth for "no duplicate notification for the same alert
+ listing + event". Replays are safe — repeating an event is a no-op.

---

## Daily / weekly digest

```
runDigest({ frequency: 'daily' })
  │
  ▼  alerts: enabled + frequency='daily' (optionally a specific alertId)
  │
  ▼  for each alert:
  │      since = alert.lastRunAt ?? 24h ago
  │      listings = where firstSeenAt OR lastSeenAt >= since
  │                       AND availability != sold
  │      for each candidate listing:
  │          match(alert, listing, { type: 'new_match' })
  │            │
  │            ├── no → skip
  │            ▼
  │          AlertNotification.create()   (P2002 caught)
  │            │
  │            ▼
  │          dispatcher.dispatch()
  │
  │      alert.lastRunAt = now
  │
  ▼  return DigestSummary
```

`lastRunAt` advances regardless of matches, so a quiet week doesn't
build up an arbitrarily long lookback.

---

## Channel dispatcher

| Channel | Status | Implementation |
| --- | --- | --- |
| `in_app` | **working** | Row's existence IS the in-app artifact. Status flips to `dispatched`. |
| `email` | placeholder | Returns `ok: false` with "configure Resend/Postmark/SES" message. Row → `failed` + reason. |
| `webhook` | placeholder | Returns `ok: false` with "implement HMAC + retry" message. |
| `web_push` | not handled | Falls through to "no handler" — explicitly out of scope this fase. |

`Dispatcher` is the ONLY component that mutates `AlertNotification.status`
/ `dispatchedAt` / `failureReason`. Swap-in for real email/webhook
delivery is a one-handler change.

Always catches handler exceptions:

```ts
catch (err) {
  await this.mark(id, 'failed', `handler-fout: ${err.message}`);
}
```

so a single broken channel can't sink an entire batch.

---

## API endpoints

| Method · Path | Auth | Purpose |
| --- | --- | --- |
| `GET /api/notifications` | user | List the calling user's notifications (filter by `status=`). |
| `POST /api/notifications/:id/acknowledge` | user | Mark a notification as read. Owns-check via userId. |
| `POST /api/alerts/digest/run` | admin | Trigger a digest run (`frequency: 'daily' | 'weekly'`, optional `alertId`). |
| `POST /api/alerts/dispatch-pending` | admin | Drain `status=pending` notifications (retry after channel outage). |

Plus the existing fase-2 endpoints for alert CRUD:
`GET /api/alerts`, `POST /api/alerts`, `PATCH /api/alerts/:id`.

---

## UI

`/notifications` page:
- 4 KPI cards: pending / dispatched / acknowledged / failed
- Per-notification card: event-type badge with icon (`TrendingDown` for
  price drops, `Sparkles` for special objects, `TrendingUp` for score),
  alert name + channel + frequency, listing title + city/country/price,
  expandable `matchedReasons` list, "Gelezen" button (calls
  `/api/notifications/:id/acknowledge`).
- Failed deliveries show the failure reason inline (e.g. "Email kanaal
  is een placeholder").

Sidebar nav (fase 3) gets a new "Meldingen" link with an `Inbox` icon.

The existing `/alerts` page already lets the user CRUD alerts with the
extended criteria; event-type selection happens in the alert form. The
alert detail view shows `criteria` as JSON so the user can verify their
event-type subscription.

---

## Tests — 35+ deterministic cases

| File | Tests | Covers |
| --- | -: | --- |
| `matcher.test.ts` | 20 | every listing-criteria field, event-subscription, price-drop gates (no drop / minDropEur / minDropPercent / payload), score-increased gates |
| `evaluator.test.ts` | 6 | listing-not-found, no-alerts, instant dispatch, daily NOT dispatched, P2002 dedup, non-match skip |
| `dispatcher.test.ts` | 9 | per-channel routing (in_app/email/webhook), unknown channel, handler-throw caught, dispatchPending batch |
| `digest.test.ts` | 4 | zero alerts, full match + lastRunAt bump, criteria mismatch, P2002 silent skip |

```powershell
pnpm test src/server/alerts
```

The matcher is a **pure function** — no I/O, no time, no DB — so its
20 tests cover the contract exhaustively without any harness.

---

## Adding a new channel

1. Implement `ChannelHandler` in
   `src/server/alerts/delivery/<channel>.ts`:

   ```ts
   export class MyChannelHandler implements ChannelHandler {
     readonly channel = 'webhook' as const;
     async deliver(n: DeliverableNotification): Promise<DeliveryResult> {
       try {
         await fetch(webhookUrl(n.userId), {
           method: 'POST',
           headers: { 'X-Signature': hmac(n) },
           body: JSON.stringify({ ... }),
         });
         return { ok: true };
       } catch (err) {
         return { ok: false, reason: err.message };
       }
     }
   }
   ```

2. Register it in `Dispatcher`'s default handlers in
   `delivery/dispatcher.ts` (or pass `new Dispatcher([new MyHandler()])`
   when invoking).

3. The dispatcher persists status / failureReason for you — handler just
   returns `{ ok, reason? }`.

4. Add the channel value to the `AlertChannel` enum (`prisma/schema.prisma`)
   if it doesn't exist yet, and update `AlertChannelSchema` in
   `src/server/schemas/common.ts`.

---

## Adding a new event type

1. Add to the `NotificationEventType` Prisma enum.
2. Extend `ListingEvent` discriminated union in `src/server/alerts/types.ts`.
3. Add gate logic in `matcher.ts` (e.g. how to verify the event payload).
4. Hook the event into the relevant service path (listings/scoring/etc.).
5. Add UI handling in `notification-list.tsx` (icon + payload preview).
6. Tests in `matcher.test.ts`.

Dedup, dispatch and notification storage automatically apply.
