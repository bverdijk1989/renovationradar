import type { SourceClassification } from "@prisma/client";

/**
 * Rule-based classifier — assigns one of:
 *   - real_estate_agency
 *   - portal
 *   - irrelevant
 *   - unknown
 *
 * Deterministic. Three signal sources, scored independently and combined:
 *   1. DOMAIN match against known-portal lists → strongly suggests `portal`.
 *   2. KEYWORD match against per-language agency / portal / irrelevant
 *      lexicons in title + meta + first ~5kB of body.
 *   3. STRUCTURAL signals: mention of "milliers d'annonces" / huge listing
 *      counts → portal. Single physical address visible → agency.
 *
 * Confidence = winner_score / total_score. When the total is 0 we return
 * `unknown` with confidence 0.
 */

const PORTAL_DOMAINS: ReadonlySet<string> = new Set([
  // France
  "leboncoin.fr",
  "seloger.com",
  "pap.fr",
  "bienici.com",
  "logic-immo.com",
  "ouestfrance-immo.com",
  "paruvendu.fr",
  // Belgium
  "immoweb.be",
  "zimmo.be",
  "immovlan.be",
  "hebbes.be",
  "logic-immo.be",
  // Germany
  "immobilienscout24.de",
  "immowelt.de",
  "immonet.de",
  "kalaydo.de",
  "kleinanzeigen.de",
  "ebay-kleinanzeigen.de",
  "ohne-makler.net",
  // Netherlands (for completeness)
  "funda.nl",
  "jaap.nl",
  "huizenzoeker.nl",
]);

const AGENCY_KEYWORDS: ReadonlyArray<string> = [
  // FR
  "agence immobilière",
  "agent immobilier",
  "agences immobilières",
  // NL
  "makelaar",
  "vastgoedkantoor",
  "vastgoed",
  // DE
  "immobilienmakler",
  "immobilienbüro",
  "immobilien-büro",
  "immobilien ",
  // Generic
  "real estate agency",
];

const PORTAL_SIGNALS: ReadonlyArray<string> = [
  "milliers d'annonces",
  "millions d'annonces",
  "duizenden advertenties",
  "alle huizen",
  "tausende immobilien",
  "millionen immobilien",
  "annonces partout en france",
  "vergleichen sie",
  "compare and",
];

const IRRELEVANT_SIGNALS: ReadonlyArray<string> = [
  // News / blog
  "actualités",
  "horoscope",
  "kruidvat",
  "blog post",
  // E-commerce
  "ajouter au panier",
  "in winkelwagen",
  "in den warenkorb",
  "shopping cart",
  // Forum
  "discussion forum",
  "post a reply",
  // Domain parking
  "this domain is for sale",
  "buy this domain",
];

export type ClassificationResult = {
  classification: SourceClassification;
  confidence: number;
  evidence: string[];
};

export function classify(input: {
  url: string;
  html?: string | null;
  /** Pre-extracted page title. If supplied, the classifier doesn't re-parse. */
  title?: string | null;
}): ClassificationResult {
  const evidence: string[] = [];
  const scores: Record<SourceClassification, number> = {
    real_estate_agency: 0,
    portal: 0,
    irrelevant: 0,
    unknown: 0,
  };

  // -------- 1. Domain rule -----------------------------------------------
  const host = safeHost(input.url);
  if (host && isKnownPortalDomain(host)) {
    scores.portal += 6;
    evidence.push(`domein "${host}" staat in known-portal lijst`);
  }

  // Bail early for empty HTML — without text we can't keyword-classify.
  const body = (input.html ?? "").toLowerCase();
  const title = (input.title ?? extractTitle(input.html ?? "")).toLowerCase();
  const haystack = `${title}\n${body.slice(0, 5_000)}`;

  if (!haystack.trim()) {
    return finalise(scores, evidence);
  }

  // -------- 2. Keyword rules ---------------------------------------------
  let agencyHits = 0;
  for (const kw of AGENCY_KEYWORDS) {
    if (haystack.includes(kw)) {
      agencyHits += 1;
      evidence.push(`agency-trefwoord: "${kw}"`);
    }
  }
  scores.real_estate_agency += agencyHits;

  let portalHits = 0;
  for (const sig of PORTAL_SIGNALS) {
    if (haystack.includes(sig)) {
      portalHits += 1;
      evidence.push(`portal-signaal: "${sig}"`);
    }
  }
  scores.portal += portalHits * 2; // portal signals weigh more than agency keywords (they're rarer)

  let irrelevantHits = 0;
  for (const sig of IRRELEVANT_SIGNALS) {
    if (haystack.includes(sig)) {
      irrelevantHits += 1;
      evidence.push(`irrelevant-signaal: "${sig}"`);
    }
  }
  scores.irrelevant += irrelevantHits * 2;

  // -------- 3. Structural heuristics -------------------------------------
  // A. Mailto link suggests there's a contact person → small agency vibe.
  if (/mailto:/.test(body)) {
    scores.real_estate_agency += 1;
    evidence.push("bevat mailto: link");
  }
  // B. Many <option> tags on a single page → portal-style filter UI.
  const optionCount = (body.match(/<option\b/g) ?? []).length;
  if (optionCount > 40) {
    scores.portal += 2;
    evidence.push(`veel <option> tags (${optionCount}) → portal-achtige filters`);
  }
  // C. Visible price filter ranges with "€" buttons → portal.
  if (/(de|von)\s*\d[\d\s.,]*\s*€\s+à\s*\d|(min|max)\.?\s*prijs/i.test(body)) {
    scores.portal += 1;
    evidence.push("prijsfilter UI gedetecteerd");
  }

  return finalise(scores, evidence);
}

function finalise(
  scores: Record<SourceClassification, number>,
  evidence: string[],
): ClassificationResult {
  const total = scores.real_estate_agency + scores.portal + scores.irrelevant;
  if (total === 0) {
    return { classification: "unknown", confidence: 0, evidence };
  }
  // Pick the highest-scoring class (ties → first in the deterministic order below).
  const order: SourceClassification[] = ["portal", "real_estate_agency", "irrelevant"];
  let winner: SourceClassification = "unknown";
  let topScore = 0;
  for (const c of order) {
    if (scores[c] > topScore) {
      winner = c;
      topScore = scores[c];
    }
  }
  return {
    classification: winner,
    confidence: Math.min(1, topScore / Math.max(3, total)),
    evidence,
  };
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function isKnownPortalDomain(host: string): boolean {
  if (PORTAL_DOMAINS.has(host)) return true;
  // Sub-domain match.
  for (const p of PORTAL_DOMAINS) {
    if (host.endsWith(`.${p}`)) return true;
  }
  return false;
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1]!.trim() : "";
}
