import type {
  Alert,
  ListingLocation,
  ListingScore,
  NormalizedListing,
  NotificationEventType,
} from "@prisma/client";
import type { AlertCriteria } from "../schemas/alerts";
import type { ListingEvent, MatchResult } from "./types";

/**
 * The shape the matcher needs from a listing. Slimmer than the full Prisma
 * row so tests can build fixtures without 30 dummy fields.
 */
export type ListingForMatching = NormalizedListing & {
  location: ListingLocation | null;
  score: ListingScore | null;
};

/**
 * Pure predicate. No DB, no I/O, no time — same inputs → same outputs.
 *
 * Decision flow:
 *   1. Subscribed to this event type? → if not, no match.
 *   2. Does the listing pass every listing-criteria filter?
 *   3. Event-specific gates (price-drop thresholds, score-jump).
 *   4. If everything passes → return matches:true with a payload snapshot.
 *
 * `evidence` accumulates one Dutch sentence per check that mattered; it
 * lands in AlertNotification.payload.matchedReasons for the UI.
 */
export function match(
  alert: Alert,
  listing: ListingForMatching,
  event: ListingEvent,
): MatchResult {
  const criteria = alert.criteria as AlertCriteria;

  // ---- 1. event type subscribed? -----------------------------------------
  const subscribed = criteria.eventTypes ?? ["new_match"];
  if (!subscribed.includes(event.type as NotificationEventType)) {
    return { matches: false, reason: `event '${event.type}' niet abonneerd` };
  }

  // ---- 2. listing filters ------------------------------------------------
  const listingCheck = matchesListingCriteria(criteria, listing);
  if (!listingCheck.ok) {
    return { matches: false, reason: listingCheck.reason };
  }

  // ---- 3. event-specific gates ------------------------------------------
  const evidence: string[] = [...listingCheck.evidence];
  const payload: Record<string, unknown> = {
    matchedReasons: [...evidence],
    listingPriceEur: listing.priceEur,
    listingCompositeScore: listing.score?.compositeScore ?? null,
  };

  if (event.type === "price_drop") {
    const prev = event.previousPriceEur;
    const cur = listing.priceEur;
    if (prev == null || cur == null || cur >= prev) {
      return { matches: false, reason: "geen daadwerkelijke prijsdaling" };
    }
    const dropEur = prev - cur;
    const dropPct = (dropEur / prev) * 100;
    if (
      criteria.minPriceDropEur !== undefined &&
      dropEur < criteria.minPriceDropEur
    ) {
      return {
        matches: false,
        reason: `prijsdaling €${dropEur} < drempel €${criteria.minPriceDropEur}`,
      };
    }
    if (
      criteria.minPriceDropPercent !== undefined &&
      dropPct < criteria.minPriceDropPercent
    ) {
      return {
        matches: false,
        reason: `prijsdaling ${dropPct.toFixed(1)}% < drempel ${criteria.minPriceDropPercent}%`,
      };
    }
    evidence.push(
      `Prijsdaling van €${prev.toLocaleString("nl-NL")} → €${cur.toLocaleString("nl-NL")} (−${dropPct.toFixed(1)}%)`,
    );
    payload.previousPriceEur = prev;
    payload.dropEur = dropEur;
    payload.dropPercent = Number(dropPct.toFixed(2));
  }

  if (event.type === "score_increased") {
    const prev = event.previousCompositeScore ?? 0;
    const cur = listing.score?.compositeScore ?? 0;
    if (cur <= prev) {
      return { matches: false, reason: "score is niet gestegen" };
    }
    const jump = cur - prev;
    if (criteria.minScoreIncrease !== undefined && jump < criteria.minScoreIncrease) {
      return {
        matches: false,
        reason: `score-stijging ${jump.toFixed(1)} < drempel ${criteria.minScoreIncrease}`,
      };
    }
    evidence.push(`Composite-score gestegen van ${prev.toFixed(1)} → ${cur.toFixed(1)}`);
    payload.previousCompositeScore = prev;
    payload.scoreJump = Number(jump.toFixed(2));
  }

  return {
    matches: true,
    evidence,
    eventType: event.type as NotificationEventType,
    payload: { ...payload, matchedReasons: evidence },
  };
}

// ---------------------------------------------------------------------------
// Listing filter predicate (mirrors buildListingWhere in services/listings.ts,
// but in-memory + producing evidence strings).
// ---------------------------------------------------------------------------

type ListingCheck =
  | { ok: true; evidence: string[] }
  | { ok: false; reason: string };

function matchesListingCriteria(
  c: AlertCriteria,
  l: ListingForMatching,
): ListingCheck {
  const evidence: string[] = [];

  if (c.country?.length && !c.country.includes(l.country)) {
    return { ok: false, reason: `land=${l.country} niet in ${c.country.join(",")}` };
  }
  if (c.country?.length) evidence.push(`Land ${l.country} ∈ {${c.country.join(", ")}}`);

  if (c.propertyType?.length && !c.propertyType.includes(l.propertyType)) {
    return {
      ok: false,
      reason: `propertyType=${l.propertyType} niet in selectie`,
    };
  }

  if (
    c.specialObjectType?.length &&
    (!l.specialObjectType || !c.specialObjectType.includes(l.specialObjectType))
  ) {
    return { ok: false, reason: "specialObjectType matcht niet" };
  }

  if (c.renovationStatus?.length && !c.renovationStatus.includes(l.renovationStatus)) {
    return { ok: false, reason: `renovatiestatus=${l.renovationStatus} niet in selectie` };
  }

  if (
    c.electricityStatus?.length &&
    !c.electricityStatus.includes(l.electricityStatus)
  ) {
    return { ok: false, reason: "stroomstatus matcht niet" };
  }

  if (c.waterStatus?.length && !c.waterStatus.includes(l.waterStatus)) {
    return { ok: false, reason: "waterstatus matcht niet" };
  }

  if (c.availability?.length && !c.availability.includes(l.availability)) {
    return { ok: false, reason: "availability matcht niet" };
  }

  if (c.isSpecialObject !== undefined && l.isSpecialObject !== c.isSpecialObject) {
    return {
      ok: false,
      reason: `isSpecialObject=${l.isSpecialObject}, gevraagd ${c.isSpecialObject}`,
    };
  }
  if (c.isSpecialObject === true) evidence.push("Bijzonder object ✓");

  if (c.isDetached !== undefined && l.isDetached !== c.isDetached) {
    return { ok: false, reason: `vrijstaand=${l.isDetached}` };
  }

  if (c.minPriceEur !== undefined && (l.priceEur ?? -Infinity) < c.minPriceEur) {
    return { ok: false, reason: `prijs te laag` };
  }
  if (c.maxPriceEur !== undefined && (l.priceEur ?? Infinity) > c.maxPriceEur) {
    return {
      ok: false,
      reason: `prijs €${l.priceEur} > drempel €${c.maxPriceEur}`,
    };
  }
  if (c.maxPriceEur !== undefined && l.priceEur != null) {
    evidence.push(`Prijs €${l.priceEur.toLocaleString("nl-NL")} ≤ €${c.maxPriceEur.toLocaleString("nl-NL")}`);
  }

  if (c.minLandM2 !== undefined && (l.landAreaM2 ?? -Infinity) < c.minLandM2) {
    return { ok: false, reason: `grond te klein (${l.landAreaM2} < ${c.minLandM2})` };
  }
  if (c.minLandM2 !== undefined && l.landAreaM2 != null) {
    evidence.push(`Grond ${l.landAreaM2.toLocaleString("nl-NL")} m² ≥ ${c.minLandM2.toLocaleString("nl-NL")} m²`);
  }
  if (c.maxLandM2 !== undefined && (l.landAreaM2 ?? Infinity) > c.maxLandM2) {
    return { ok: false, reason: `grond te groot` };
  }

  const dist = l.location?.distanceFromVenloKm ?? null;
  if (c.minDistanceKm !== undefined && (dist ?? -Infinity) < c.minDistanceKm) {
    return { ok: false, reason: `afstand te dichtbij` };
  }
  if (c.maxDistanceKm !== undefined) {
    if (dist == null) return { ok: false, reason: `geen locatie bekend (afstandsfilter actief)` };
    if (dist > c.maxDistanceKm) {
      return {
        ok: false,
        reason: `afstand ${dist.toFixed(0)} km > ${c.maxDistanceKm} km`,
      };
    }
    evidence.push(`Afstand ${dist.toFixed(0)} km ≤ ${c.maxDistanceKm} km`);
  }

  if (c.minMatchScore !== undefined) {
    const ms = l.score?.matchScore ?? null;
    if (ms == null) return { ok: false, reason: `geen score (matchScore-filter actief)` };
    if (ms < c.minMatchScore) {
      return { ok: false, reason: `matchScore ${ms.toFixed(0)} < ${c.minMatchScore}` };
    }
    evidence.push(`Match-score ${ms.toFixed(0)} ≥ ${c.minMatchScore}`);
  }
  if (c.minCompositeScore !== undefined) {
    const cs = l.score?.compositeScore ?? null;
    if (cs == null) return { ok: false, reason: `geen score (compositeScore-filter actief)` };
    if (cs < c.minCompositeScore) {
      return { ok: false, reason: `compositeScore ${cs.toFixed(0)} < ${c.minCompositeScore}` };
    }
    evidence.push(`Composite-score ${cs.toFixed(0)} ≥ ${c.minCompositeScore}`);
  }

  if (c.search) {
    const haystack = [l.titleNl, l.titleOriginal, l.city, l.addressLine]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(c.search.toLowerCase())) {
      return { ok: false, reason: `zoekterm "${c.search}" niet gevonden` };
    }
    evidence.push(`Zoekterm "${c.search}" gevonden`);
  }

  return { ok: true, evidence };
}
