/**
 * Source registry seed data.
 *
 * Legal stance: every external source ships as `status: pending_review` and
 * `legalStatus: pending_review`. A connector framework MUST refuse to run
 * against any source whose status is not `active`. Only `manual_entry`
 * and `email_inbox` sources may ship as `status: active` because they don't
 * touch external systems.
 *
 * No real real-estate sites are seeded here on purpose. Activating a source
 * is a human decision in the admin Source Registry UI, with an explicit
 * SourceReview row recording the evidence (ToS snapshot, robots.txt URL).
 */

import type {
  Country,
  SourceType,
  CollectionMethod,
  RobotsStatus,
  TermsStatus,
  LegalStatus,
  SourceStatus,
} from "@prisma/client";

export type SourceSeed = {
  /** Stable seed key used by listings seed to look up the manual-entry source. */
  seedKey: string;
  name: string;
  country: Country;
  website: string;
  sourceType: SourceType;
  collectionMethods: CollectionMethod[];
  status: SourceStatus;
  robotsStatus: RobotsStatus;
  termsStatus: TermsStatus;
  legalStatus: LegalStatus;
  notes: string;
  rateLimitPerMinute?: number;
};

export const sourceSeeds: SourceSeed[] = [
  // --- Manual entry per country (always safe) -----------------------------
  {
    seedKey: "manual_nl",
    name: "Manual entry · NL",
    country: "NL",
    website: "internal://manual",
    sourceType: "manual",
    collectionMethods: ["manual_entry"],
    status: "active",
    robotsStatus: "not_applicable",
    termsStatus: "not_applicable",
    legalStatus: "green",
    notes: "Handmatige invoer. Geen externe bron, geen legal surface.",
  },
  {
    seedKey: "manual_fr",
    name: "Manual entry · FR",
    country: "FR",
    website: "internal://manual",
    sourceType: "manual",
    collectionMethods: ["manual_entry"],
    status: "active",
    robotsStatus: "not_applicable",
    termsStatus: "not_applicable",
    legalStatus: "green",
    notes: "Saisie manuelle. Aucune source externe interrogée.",
  },
  {
    seedKey: "manual_be",
    name: "Manual entry · BE",
    country: "BE",
    website: "internal://manual",
    sourceType: "manual",
    collectionMethods: ["manual_entry"],
    status: "active",
    robotsStatus: "not_applicable",
    termsStatus: "not_applicable",
    legalStatus: "green",
    notes: "Handmatige invoer / saisie manuelle.",
  },
  {
    seedKey: "manual_de",
    name: "Manual entry · DE",
    country: "DE",
    website: "internal://manual",
    sourceType: "manual",
    collectionMethods: ["manual_entry"],
    status: "active",
    robotsStatus: "not_applicable",
    termsStatus: "not_applicable",
    legalStatus: "green",
    notes: "Manuelle Eingabe. Keine externe Quelle.",
  },

  // --- Email forwarding placeholder ---------------------------------------
  {
    seedKey: "email_forward",
    name: "Email forwarding inbox",
    country: "NL",
    website: "internal://email",
    sourceType: "email",
    collectionMethods: ["email_inbox"],
    status: "pending_review",
    robotsStatus: "not_applicable",
    termsStatus: "not_applicable",
    legalStatus: "green",
    notes:
      "Forward listing alerts (eigen Google Alerts, makelaar-mailings) naar een dedicated inbox; de inbox-connector parsed het. Activeer pas als de inbox is ingericht.",
  },

  // --- External placeholders (NOT pre-approved) ---------------------------
  {
    seedKey: "rss_example_fr",
    name: "Example RSS feed · FR (placeholder)",
    country: "FR",
    website: "https://example.com/feed",
    sourceType: "rss",
    collectionMethods: ["rss"],
    status: "pending_review",
    robotsStatus: "unknown",
    termsStatus: "unknown",
    legalStatus: "pending_review",
    rateLimitPerMinute: 6,
    notes:
      "Placeholder. Vervang door echte RSS-feed nadat je robots.txt + ToS hebt gecontroleerd en rate limit hebt afgesproken.",
  },
  {
    seedKey: "sitemap_example_de",
    name: "Example sitemap · DE (placeholder)",
    country: "DE",
    website: "https://example.de/sitemap.xml",
    sourceType: "sitemap",
    collectionMethods: ["sitemap"],
    status: "pending_review",
    robotsStatus: "unknown",
    termsStatus: "unknown",
    legalStatus: "pending_review",
    rateLimitPerMinute: 10,
    notes:
      "Sitemaps zijn meestal expliciet bedoeld om gelezen te worden; de inhoud achter de URLs blijft onder ToS. Verifieer beide.",
  },
  {
    seedKey: "api_example_be",
    name: "Example notarial open data · BE (placeholder)",
    country: "BE",
    website: "https://example.be/open-data",
    sourceType: "api",
    collectionMethods: ["api"],
    status: "pending_review",
    robotsStatus: "allows",
    termsStatus: "unknown",
    legalStatus: "pending_review",
    rateLimitPerMinute: 30,
    notes:
      "Notariële open-datasets kunnen een goede primaire bron voor BE zijn. Verifieer licentie (vaak CC BY).",
  },
];
