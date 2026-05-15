/**
 * Test listings (≥10). Spread across FR/BE/DE with a mix of regular
 * renovation properties and special objects. One listing sits outside the
 * 350 km Venlo radius on purpose so the distance filter has something to
 * exclude in dev / tests.
 *
 * Lat/lng are real coordinates of small towns / regions, not exact
 * addresses. Coordinates feed the listing_locations trigger which fills
 * the geography column + distance_from_venlo_km on insert.
 *
 * Photo URLs use picsum.photos (CC0 placeholders, render in dev).
 *
 * sourceKey ↔ SourceSeed.seedKey: which manual-entry source owns the row.
 * agencyKey ↔ AgencySeed.seedKey: optional agency relation.
 */

import type {
  Country,
  PropertyType,
  RenovationStatus,
  SpecialObjectType,
  TernaryFlag,
  UtilityStatus,
  Language,
  ListingAvailability,
} from "@prisma/client";

export type AgencySeed = {
  seedKey: string;
  name: string;
  country: Country;
  website?: string;
  email?: string;
};

export const agencySeeds: AgencySeed[] = [
  {
    seedKey: "fr_lorraine_immo",
    name: "Immobilier Lorraine (example)",
    country: "FR",
    website: "https://example.fr/lorraine",
  },
  {
    seedKey: "fr_rural_partners",
    name: "Rural Partners FR (example)",
    country: "FR",
    website: "https://example.fr/rural",
  },
  {
    seedKey: "be_wallonia_estates",
    name: "Wallonia Estates (example)",
    country: "BE",
    website: "https://example.be/wallonia",
  },
  {
    seedKey: "de_eifel_makler",
    name: "Eifel Makler (example)",
    country: "DE",
    website: "https://example.de/eifel",
  },
];

export type FeatureSeed = {
  key: string;
  valueString?: string;
  valueNumber?: number;
  valueBool?: boolean;
  confidence?: number;
};

export type MediaSeed = {
  url: string;
  caption?: string;
};

export type ScoreSeed = {
  matchScore: number;
  renovationScore: number;
  specialObjectScore: number;
  dataConfidence: number;
  investmentPotentialScore: number;
  /** If omitted, the seed computes composite from COMPOSITE_WEIGHTS. */
  compositeScore?: number;
};

export type ListingSeed = {
  /** Stable seed identifier (also used as `originalUrl` fragment for dev). */
  seedKey: string;
  sourceKey: string;
  agencyKey?: string;

  titleOriginal: string;
  titleNl?: string;
  descriptionOriginal?: string;
  descriptionNl?: string;
  language: Language;

  priceEur: number;
  propertyType: PropertyType;
  renovationStatus: RenovationStatus;
  isSpecialObject: boolean;
  specialObjectType?: SpecialObjectType;
  isDetached: TernaryFlag;

  landAreaM2: number;
  livingAreaM2?: number;
  rooms?: number;

  electricityStatus: UtilityStatus;
  waterStatus: UtilityStatus;

  addressLine?: string;
  postalCode?: string;
  city: string;
  region?: string;
  country: Country;
  lat: number;
  lng: number;

  availability?: ListingAvailability;
  publishedAtDaysAgo?: number;

  features: FeatureSeed[];
  media: MediaSeed[];
  score: ScoreSeed;
};

// =============================================================================
// 11 LISTINGS - mix of special objects + regular renovations, 10 in radius
// =============================================================================

export const listingSeeds: ListingSeed[] = [
  // 1. FR Lorraine - Longère
  {
    seedKey: "fr_longere_meuse",
    sourceKey: "manual_fr",
    agencyKey: "fr_lorraine_immo",
    titleOriginal: "Longère à rénover avec 1,2 ha de terrain",
    titleNl: "Te renoveren longère met 1,2 hectare grond",
    descriptionOriginal:
      "Longère traditionnelle en pierre, à rénover entièrement. Terrain de 12 500 m² avec ancien verger. Eau et électricité raccordés.",
    descriptionNl:
      "Traditionele stenen longère, volledig te renoveren. Perceel van 12.500 m² met oude boomgaard. Water en stroom aanwezig.",
    language: "fr",
    priceEur: 145_000,
    propertyType: "longere",
    renovationStatus: "needs_renovation",
    isSpecialObject: false,
    isDetached: "yes",
    landAreaM2: 12_500,
    livingAreaM2: 140,
    rooms: 5,
    electricityStatus: "present",
    waterStatus: "present",
    addressLine: "Lieu-dit Le Verger",
    postalCode: "55000",
    city: "Bar-le-Duc",
    region: "Grand Est",
    country: "FR",
    lat: 49.10,
    lng: 6.10,
    availability: "for_sale",
    publishedAtDaysAgo: 12,
    features: [
      { key: "has_well", valueBool: true, confidence: 0.7 },
      { key: "has_fireplace", valueBool: true, confidence: 0.9 },
      { key: "roof_condition", valueString: "poor", confidence: 0.6 },
      { key: "land_area_m2", valueNumber: 12_500, confidence: 1.0 },
    ],
    media: [
      { url: "https://picsum.photos/seed/fr-longere-1/1024/768", caption: "Voorgevel" },
      { url: "https://picsum.photos/seed/fr-longere-2/1024/768", caption: "Achterzijde" },
    ],
    score: {
      matchScore: 82,
      renovationScore: 78,
      specialObjectScore: 0,
      dataConfidence: 80,
      investmentPotentialScore: 70,
    },
  },

  // 2. FR Ardennes - Watermolen (special)
  {
    seedKey: "fr_moulin_ardennes",
    sourceKey: "manual_fr",
    agencyKey: "fr_rural_partners",
    titleOriginal: "Ancien moulin à eau sur 1,8 ha avec bief",
    titleNl: "Oude watermolen op 1,8 hectare met molenbeek",
    descriptionOriginal:
      "Moulin à eau du XVIIIᵉ avec mécanisme partiellement conservé. Rénovation partielle effectuée (toiture neuve). Cours d'eau privé.",
    descriptionNl:
      "Watermolen uit de 18e eeuw met deels bewaard mechaniek. Gedeeltelijke renovatie (nieuw dak). Eigen waterloop.",
    language: "fr",
    priceEur: 185_000,
    propertyType: "watermill",
    renovationStatus: "partial_renovation",
    isSpecialObject: true,
    specialObjectType: "watermill",
    isDetached: "yes",
    landAreaM2: 18_000,
    livingAreaM2: 220,
    rooms: 7,
    electricityStatus: "present",
    waterStatus: "present",
    addressLine: "Vallée de la Semoy",
    postalCode: "08800",
    city: "Monthermé",
    region: "Grand Est",
    country: "FR",
    lat: 49.88,
    lng: 4.75,
    availability: "for_sale",
    publishedAtDaysAgo: 4,
    features: [
      { key: "has_water_stream", valueBool: true, confidence: 1.0 },
      { key: "mill_mechanism_preserved", valueString: "partial", confidence: 0.8 },
      { key: "heritage_protected", valueBool: true, confidence: 0.9 },
      { key: "stream_flow_l_s", valueNumber: 35, confidence: 0.5, },
    ],
    media: [
      { url: "https://picsum.photos/seed/fr-moulin-1/1024/768", caption: "Molen vanaf de beek" },
      { url: "https://picsum.photos/seed/fr-moulin-2/1024/768", caption: "Binnenwerk" },
    ],
    score: {
      matchScore: 91,
      renovationScore: 72,
      specialObjectScore: 96,
      dataConfidence: 85,
      investmentPotentialScore: 88,
    },
  },

  // 3. FR Champagne - Corps de ferme (ruin-ish)
  {
    seedKey: "fr_corps_ferme_champagne",
    sourceKey: "manual_fr",
    titleOriginal: "Corps de ferme à restaurer 2,5 ha",
    titleNl: "Te restaureren boerderijcomplex 2,5 hectare",
    descriptionOriginal:
      "Ensemble agricole avec grange, maison principale et dépendances. État ruine pour la grange, maison principale habitable après rénovation.",
    descriptionNl:
      "Agrarisch ensemble met schuur, hoofdgebouw en bijgebouwen. Schuur is ruïne; hoofdgebouw bewoonbaar na renovatie.",
    language: "fr",
    priceEur: 110_000,
    propertyType: "farmhouse",
    renovationStatus: "ruin",
    isSpecialObject: false,
    isDetached: "yes",
    landAreaM2: 25_000,
    livingAreaM2: 180,
    rooms: 6,
    electricityStatus: "present",
    waterStatus: "unknown",
    city: "Vitry-le-François",
    region: "Grand Est",
    country: "FR",
    lat: 48.72,
    lng: 4.58,
    availability: "for_sale",
    publishedAtDaysAgo: 28,
    features: [
      { key: "barn_count", valueNumber: 2, confidence: 0.9 },
      { key: "land_arable_ratio", valueNumber: 0.6, confidence: 0.5 },
      { key: "structural_concerns", valueString: "barn_roof_collapsed", confidence: 0.8 },
    ],
    media: [
      { url: "https://picsum.photos/seed/fr-ferme-1/1024/768" },
    ],
    score: {
      matchScore: 76,
      renovationScore: 90,
      specialObjectScore: 0,
      dataConfidence: 65,
      investmentPotentialScore: 82,
    },
  },

  // 4. BE Wallonia near Liège - Hoeve
  {
    seedKey: "be_hoeve_liege",
    sourceKey: "manual_be",
    agencyKey: "be_wallonia_estates",
    titleOriginal: "Hoeve te renoveren 1,15 ha - Province de Liège",
    descriptionOriginal:
      "Vrijstaande hoeve uit 1890. Volledige renovatie nodig. Stroom en water aanwezig. Goede toegang tot grote weg.",
    language: "nl",
    priceEur: 175_000,
    propertyType: "farmhouse",
    renovationStatus: "needs_renovation",
    isSpecialObject: false,
    isDetached: "yes",
    landAreaM2: 11_500,
    livingAreaM2: 165,
    rooms: 6,
    electricityStatus: "present",
    waterStatus: "present",
    postalCode: "4577",
    city: "Modave",
    region: "Liège",
    country: "BE",
    lat: 50.45,
    lng: 5.30,
    availability: "for_sale",
    publishedAtDaysAgo: 8,
    features: [
      { key: "build_year", valueNumber: 1890, confidence: 0.9 },
      { key: "has_outbuildings", valueBool: true, confidence: 1.0 },
      { key: "road_access", valueString: "good", confidence: 0.8 },
    ],
    media: [
      { url: "https://picsum.photos/seed/be-hoeve-1/1024/768" },
      { url: "https://picsum.photos/seed/be-hoeve-2/1024/768" },
    ],
    score: {
      matchScore: 86,
      renovationScore: 75,
      specialObjectScore: 0,
      dataConfidence: 82,
      investmentPotentialScore: 74,
    },
  },

  // 5. BE Wallonia - Sluiswachterswoning (special)
  {
    seedKey: "be_sluiswachter_canal",
    sourceKey: "manual_be",
    agencyKey: "be_wallonia_estates",
    titleOriginal: "Maison éclusière sur canal, 1,05 ha",
    titleNl: "Sluiswachterswoning aan het kanaal, 1,05 hectare",
    descriptionOriginal:
      "Ancienne maison éclusière du canal Charleroi-Bruxelles. Rénovation partielle (toiture, fenêtres). Vue directe sur le canal.",
    descriptionNl:
      "Oude sluiswachterswoning aan het kanaal Charleroi-Brussel. Gedeeltelijke renovatie (dak, ramen). Direct zicht op het kanaal.",
    language: "fr",
    priceEur: 165_000,
    propertyType: "lock_keeper_house",
    renovationStatus: "partial_renovation",
    isSpecialObject: true,
    specialObjectType: "lock_keeper_house",
    isDetached: "yes",
    landAreaM2: 10_500,
    livingAreaM2: 95,
    rooms: 4,
    electricityStatus: "present",
    waterStatus: "present",
    city: "Seneffe",
    region: "Hainaut",
    country: "BE",
    lat: 50.53,
    lng: 4.27,
    availability: "for_sale",
    publishedAtDaysAgo: 5,
    features: [
      { key: "canal_frontage_m", valueNumber: 45, confidence: 0.9 },
      { key: "heritage_protected", valueBool: true, confidence: 0.8 },
      { key: "roof_renewed_year", valueNumber: 2019, confidence: 0.9 },
    ],
    media: [
      { url: "https://picsum.photos/seed/be-sluis-1/1024/768", caption: "Sluiswachterswoning" },
    ],
    score: {
      matchScore: 88,
      renovationScore: 60,
      specialObjectScore: 94,
      dataConfidence: 86,
      investmentPotentialScore: 80,
    },
  },

  // 6. BE Wallonia - Stationsgebouw (special)
  {
    seedKey: "be_station_namur",
    sourceKey: "manual_be",
    titleOriginal: "Ancienne gare désaffectée à rénover - 1,02 ha",
    titleNl: "Voormalig stationsgebouw te renoveren - 1,02 hectare",
    descriptionOriginal:
      "Bâtiment de gare désaffecté depuis 1985. Structure saine. Conversion en habitation possible.",
    descriptionNl:
      "Sinds 1985 buiten dienst gesteld stationsgebouw. Structureel gezond. Conversie naar woning mogelijk.",
    language: "fr",
    priceEur: 155_000,
    propertyType: "station_building",
    renovationStatus: "needs_renovation",
    isSpecialObject: true,
    specialObjectType: "station_building",
    isDetached: "yes",
    landAreaM2: 10_200,
    livingAreaM2: 240,
    rooms: 8,
    electricityStatus: "likely",
    waterStatus: "likely",
    city: "Ciney",
    region: "Namur",
    country: "BE",
    lat: 50.30,
    lng: 5.10,
    availability: "for_sale",
    publishedAtDaysAgo: 21,
    features: [
      { key: "year_decommissioned", valueNumber: 1985, confidence: 1.0 },
      { key: "platform_length_m", valueNumber: 80, confidence: 0.7 },
      { key: "near_active_rail", valueBool: false, confidence: 1.0 },
    ],
    media: [
      { url: "https://picsum.photos/seed/be-station-1/1024/768", caption: "Voorgevel met perron" },
      { url: "https://picsum.photos/seed/be-station-2/1024/768", caption: "Wachtkamer" },
    ],
    score: {
      matchScore: 84,
      renovationScore: 80,
      specialObjectScore: 92,
      dataConfidence: 72,
      investmentPotentialScore: 85,
    },
  },

  // 7. DE Eifel - Bauernhaus
  {
    seedKey: "de_bauernhaus_eifel",
    sourceKey: "manual_de",
    agencyKey: "de_eifel_makler",
    titleOriginal: "Sanierungsbedürftiges Bauernhaus mit 1,3 ha",
    titleNl: "Te renoveren boerderij met 1,3 hectare",
    descriptionOriginal:
      "Freistehendes Bauernhaus, Baujahr ca. 1920. Strom und Wasser vorhanden. Komplette Sanierung nötig.",
    descriptionNl:
      "Vrijstaande boerderij, bouwjaar circa 1920. Stroom en water aanwezig. Volledige renovatie nodig.",
    language: "de",
    priceEur: 195_000,
    propertyType: "farmhouse",
    renovationStatus: "needs_renovation",
    isSpecialObject: false,
    isDetached: "yes",
    landAreaM2: 13_000,
    livingAreaM2: 175,
    rooms: 6,
    electricityStatus: "present",
    waterStatus: "present",
    postalCode: "54595",
    city: "Prüm",
    region: "Rheinland-Pfalz",
    country: "DE",
    lat: 50.21,
    lng: 6.42,
    availability: "for_sale",
    publishedAtDaysAgo: 10,
    features: [
      { key: "build_year", valueNumber: 1920, confidence: 0.8 },
      { key: "has_barn", valueBool: true, confidence: 0.95 },
      { key: "outbuilding_count", valueNumber: 2, confidence: 0.9 },
    ],
    media: [
      { url: "https://picsum.photos/seed/de-bauernhaus-1/1024/768" },
    ],
    score: {
      matchScore: 83,
      renovationScore: 78,
      specialObjectScore: 0,
      dataConfidence: 84,
      investmentPotentialScore: 72,
    },
  },

  // 8. DE Sauerland - Wassermühle (special)
  {
    seedKey: "de_wassermuhle_sauerland",
    sourceKey: "manual_de",
    titleOriginal: "Historische Wassermühle, 1,5 ha, teilsaniert",
    titleNl: "Historische watermolen, 1,5 hectare, gedeeltelijk gerenoveerd",
    descriptionOriginal:
      "Wassermühle aus dem 19. Jahrhundert. Mahlwerk noch vorhanden. Teilsanierung 2018 abgeschlossen (Dach, Heizung).",
    descriptionNl:
      "Watermolen uit de 19e eeuw. Maalwerk nog aanwezig. Gedeeltelijke renovatie in 2018 voltooid (dak, verwarming).",
    language: "de",
    priceEur: 198_000,
    propertyType: "watermill",
    renovationStatus: "partial_renovation",
    isSpecialObject: true,
    specialObjectType: "watermill",
    isDetached: "yes",
    landAreaM2: 15_000,
    livingAreaM2: 200,
    rooms: 6,
    electricityStatus: "likely",
    waterStatus: "present",
    city: "Brilon",
    region: "Nordrhein-Westfalen",
    country: "DE",
    lat: 51.39,
    lng: 8.57,
    availability: "for_sale",
    publishedAtDaysAgo: 3,
    features: [
      { key: "has_water_stream", valueBool: true, confidence: 1.0 },
      { key: "mill_mechanism_preserved", valueString: "full", confidence: 0.95 },
      { key: "heating_year", valueNumber: 2018, confidence: 1.0 },
      { key: "monument_protected", valueBool: true, confidence: 0.9 },
    ],
    media: [
      { url: "https://picsum.photos/seed/de-muhle-1/1024/768", caption: "Molen met waterrad" },
      { url: "https://picsum.photos/seed/de-muhle-2/1024/768", caption: "Maalwerk" },
    ],
    score: {
      matchScore: 89,
      renovationScore: 55,
      specialObjectScore: 97,
      dataConfidence: 90,
      investmentPotentialScore: 87,
    },
  },

  // 9. DE Niedersachsen - Resthof
  {
    seedKey: "de_resthof_niedersachsen",
    sourceKey: "manual_de",
    titleOriginal: "Resthof Alleinlage 2,2 ha",
    titleNl: "Resthof afgelegen ligging 2,2 hectare",
    descriptionOriginal:
      "Resthof in absoluter Alleinlage. Außenbereich. Strom und Wasser sind zu prüfen. Größtes Stück Grünland.",
    descriptionNl:
      "Resthof in absolute alleenligging. Buitengebied. Stroom en water nog te controleren. Grootste deel grasland.",
    language: "de",
    priceEur: 120_000,
    propertyType: "farmhouse",
    renovationStatus: "needs_renovation",
    isSpecialObject: false,
    isDetached: "yes",
    landAreaM2: 22_000,
    livingAreaM2: 150,
    rooms: 5,
    electricityStatus: "unknown",
    waterStatus: "unknown",
    city: "Diepholz",
    region: "Niedersachsen",
    country: "DE",
    lat: 52.61,
    lng: 8.37,
    availability: "for_sale",
    publishedAtDaysAgo: 35,
    features: [
      { key: "isolation", valueString: "alleinlage", confidence: 1.0 },
      { key: "grassland_ratio", valueNumber: 0.85, confidence: 0.6 },
    ],
    media: [
      { url: "https://picsum.photos/seed/de-resthof-1/1024/768" },
    ],
    score: {
      matchScore: 79,
      renovationScore: 70,
      specialObjectScore: 0,
      dataConfidence: 55,
      investmentPotentialScore: 76,
    },
  },

  // 10. DE Rheinland-Pfalz - Mühle / windmill (special)
  {
    seedKey: "de_muhle_rheinland",
    sourceKey: "manual_de",
    agencyKey: "de_eifel_makler",
    titleOriginal: "Alte Windmühle zum Ausbau, 1,1 ha",
    titleNl: "Oude windmolen voor afbouw, 1,1 hectare",
    descriptionOriginal:
      "Windmühle als Wohnhaus konvertierbar. Teilsaniert. Strom vorhanden, Wasser auf dem Grundstück.",
    descriptionNl:
      "Windmolen, te converteren tot woning. Gedeeltelijk gerenoveerd. Stroom aanwezig, water op het perceel.",
    language: "de",
    priceEur: 145_000,
    propertyType: "mill",
    renovationStatus: "partial_renovation",
    isSpecialObject: true,
    specialObjectType: "mill",
    isDetached: "yes",
    landAreaM2: 11_000,
    livingAreaM2: 110,
    rooms: 4,
    electricityStatus: "present",
    waterStatus: "present",
    city: "Koblenz",
    region: "Rheinland-Pfalz",
    country: "DE",
    lat: 50.36,
    lng: 7.59,
    availability: "for_sale",
    publishedAtDaysAgo: 14,
    features: [
      { key: "mill_type", valueString: "windmill", confidence: 1.0 },
      { key: "sails_present", valueBool: false, confidence: 0.9 },
      { key: "monument_protected", valueBool: true, confidence: 0.85 },
    ],
    media: [
      { url: "https://picsum.photos/seed/de-windmuhle-1/1024/768" },
      { url: "https://picsum.photos/seed/de-windmuhle-2/1024/768" },
    ],
    score: {
      matchScore: 85,
      renovationScore: 65,
      specialObjectScore: 90,
      dataConfidence: 78,
      investmentPotentialScore: 82,
    },
  },

  // 11. FR Normandy - Lighthouse keeper house (OUTSIDE radius - test exclusion)
  {
    seedKey: "fr_lighthouse_normandy",
    sourceKey: "manual_fr",
    titleOriginal: "Ancienne maison de gardien de phare - Normandie",
    titleNl: "Voormalige vuurtorenwachterswoning - Normandië",
    descriptionOriginal:
      "Maison de gardien de phare entièrement rénovée, vue mer. 1 ha. Hors zone Venlo - inclus pour tester le filtre distance.",
    descriptionNl:
      "Volledig gerenoveerde vuurtorenwachterswoning, zicht op zee. 1 ha. Buiten Venlo-zone — staat hier ter test van de afstandsfilter.",
    language: "fr",
    priceEur: 190_000,
    propertyType: "lighthouse",
    renovationStatus: "move_in_ready",
    isSpecialObject: true,
    specialObjectType: "lighthouse",
    isDetached: "yes",
    landAreaM2: 10_000,
    livingAreaM2: 105,
    rooms: 4,
    electricityStatus: "present",
    waterStatus: "present",
    city: "Cherbourg-en-Cotentin",
    region: "Normandie",
    country: "FR",
    lat: 49.65,
    lng: -1.62,
    availability: "for_sale",
    publishedAtDaysAgo: 2,
    features: [
      { key: "sea_view", valueBool: true, confidence: 1.0 },
      { key: "coastal_protection_zone", valueBool: true, confidence: 0.95 },
      { key: "monument_protected", valueBool: true, confidence: 0.9 },
    ],
    media: [
      { url: "https://picsum.photos/seed/fr-lighthouse-1/1024/768", caption: "Vuurtoren en wachterswoning" },
    ],
    score: {
      matchScore: 30, // low because of distance penalty
      renovationScore: 30,
      specialObjectScore: 95,
      dataConfidence: 88,
      investmentPotentialScore: 60,
    },
  },
];
