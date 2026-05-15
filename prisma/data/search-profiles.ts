/**
 * Search profile seed data.
 *
 * Sourced verbatim from the project brief. When a term is shared across
 * languages (e.g. "maison à rénover" appears in both the FR and BE-FR lists),
 * it is intentionally repeated per profile because each profile drives a
 * separate query against its country's sources.
 *
 * Categories drive scoring weights:
 *   - general:        baseline match
 *   - rural:          slight boost (land-focused phrasing)
 *   - land:           strong boost on hectare/m² fitness
 *   - special_object: highest boost; also flips is_special_object heuristic
 *   - detached:       hard filter signal for is_detached
 */

import type { Country, Language } from "@prisma/client";

export type SearchProfileSeed = {
  name: string;
  country: Country;
  language: Language;
  category: "general" | "rural" | "land" | "special_object" | "detached";
  terms: string[];
};

export const searchProfileSeeds: SearchProfileSeed[] = [
  // --------------------------------------------------------------------------
  // FRANCE (FR) - French
  // --------------------------------------------------------------------------
  {
    name: "FR · général · à rénover",
    country: "FR",
    language: "fr",
    category: "general",
    terms: [
      "maison à rénover",
      "ferme à rénover",
      "grange à rénover",
      "maison individuelle",
      "maison isolée",
    ],
  },
  {
    name: "FR · rural",
    country: "FR",
    language: "fr",
    category: "rural",
    terms: [
      "corps de ferme",
      "longère",
      "propriété rurale",
    ],
  },
  {
    name: "FR · terrain",
    country: "FR",
    language: "fr",
    category: "land",
    terms: [
      "terrain 1 hectare",
      "terrain 10000 m²",
      "maison avec terrain",
    ],
  },
  {
    name: "FR · objets spéciaux",
    country: "FR",
    language: "fr",
    category: "special_object",
    terms: [
      "moulin à vendre",
      "ancien moulin",
      "moulin à eau",
      "ancienne gare",
      "maison éclusière",
      "maison de garde-barrière",
    ],
  },

  // --------------------------------------------------------------------------
  // BELGIUM (BE) - Dutch
  // --------------------------------------------------------------------------
  {
    name: "BE · algemeen · opknap",
    country: "BE",
    language: "nl",
    category: "general",
    terms: [
      "opknapwoning",
      "renovatiewoning",
      "te renoveren woning",
      "vrijstaande woning",
      "hoeve te koop",
      "boerderij te koop",
    ],
  },
  {
    name: "BE · grond",
    country: "BE",
    language: "nl",
    category: "land",
    terms: [
      "woning met 1 hectare grond",
      "woning met 10000 m² grond",
    ],
  },
  {
    name: "BE · bijzondere objecten",
    country: "BE",
    language: "nl",
    category: "special_object",
    terms: [
      "watermolen te koop",
      "molen te koop",
      "sluiswachterswoning",
      "stationsgebouw te koop",
    ],
  },

  // --------------------------------------------------------------------------
  // BELGIUM (BE) - French (Wallonia)
  // --------------------------------------------------------------------------
  {
    name: "BE · général · à rénover (FR)",
    country: "BE",
    language: "fr",
    category: "general",
    terms: [
      "maison à rénover",
      "ferme à rénover",
      "maison 4 façades",
    ],
  },
  {
    name: "BE · objets spéciaux (FR)",
    country: "BE",
    language: "fr",
    category: "special_object",
    terms: [
      "moulin à vendre",
      "ancienne gare",
      "maison éclusière",
    ],
  },

  // --------------------------------------------------------------------------
  // GERMANY (DE) - German
  // --------------------------------------------------------------------------
  {
    name: "DE · allgemein · sanierung",
    country: "DE",
    language: "de",
    category: "general",
    terms: [
      "renovierungsbedürftiges Haus",
      "sanierungsbedürftiges Haus",
      "freistehendes Haus",
      "Bauernhaus",
      "Resthof",
      "Landhaus",
    ],
  },
  {
    name: "DE · Grundstück",
    country: "DE",
    language: "de",
    category: "land",
    terms: [
      "Haus mit Grundstück",
      "Haus mit 10000 m² Grundstück",
      "Haus mit 1 ha Grundstück",
      "Alleinlage",
      "Außenbereich",
    ],
  },
  {
    name: "DE · Sonderobjekte",
    country: "DE",
    language: "de",
    category: "special_object",
    terms: [
      "Mühle kaufen",
      "Wassermühle kaufen",
      "Bahnhofsgebäude kaufen",
      "Schleusenwärterhaus",
    ],
  },
];
