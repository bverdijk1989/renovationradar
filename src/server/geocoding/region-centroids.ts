import type { Country } from "@prisma/client";

/**
 * Region centroids — fallback locations when a listing only has region info
 * (no postal code, no city). Coordinates are deliberate approximations: a
 * "regional center" rather than an exact administrative centroid, picked
 * to fall inside the 350 km Venlo radius where applicable.
 *
 * Keys are lowercase. Match accepts loose comparison: the engine lowercases
 * the input region and tries `includes()` matches, so "Région Grand Est"
 * matches "grand est" and "Hauts-de-France" matches "hauts".
 */

type Centroid = { lat: number; lng: number; label: string };

const FR_REGIONS: Record<string, Centroid> = {
  "grand est": { lat: 48.7, lng: 6.18, label: "Grand Est (FR)" },
  "lorraine": { lat: 48.85, lng: 6.18, label: "Lorraine" },
  "champagne-ardenne": { lat: 49.16, lng: 4.62, label: "Champagne-Ardenne" },
  "ardennes": { lat: 49.65, lng: 4.78, label: "Ardennes (FR)" },
  "picardie": { lat: 49.85, lng: 2.98, label: "Picardie" },
  "hauts-de-france": { lat: 50.62, lng: 3.06, label: "Hauts-de-France" },
  "normandie": { lat: 49.18, lng: 0.37, label: "Normandie" },
  "bourgogne": { lat: 47.32, lng: 4.83, label: "Bourgogne" },
  "bretagne": { lat: 48.2, lng: -2.93, label: "Bretagne" },
};

const BE_REGIONS: Record<string, Centroid> = {
  "wallonie": { lat: 50.4, lng: 4.85, label: "Wallonie" },
  "wallonia": { lat: 50.4, lng: 4.85, label: "Wallonie" },
  "liège": { lat: 50.63, lng: 5.57, label: "Province de Liège" },
  "liege": { lat: 50.63, lng: 5.57, label: "Province de Liège" },
  "namur": { lat: 50.27, lng: 4.87, label: "Province de Namur" },
  "hainaut": { lat: 50.4, lng: 4.0, label: "Province de Hainaut" },
  "luxembourg belge": { lat: 49.85, lng: 5.5, label: "Province de Luxembourg (BE)" },
  "luxembourg": { lat: 49.85, lng: 5.5, label: "Province de Luxembourg (BE)" },
  "flandre": { lat: 51.03, lng: 4.35, label: "Vlaanderen" },
  "vlaanderen": { lat: 51.03, lng: 4.35, label: "Vlaanderen" },
};

const DE_REGIONS: Record<string, Centroid> = {
  "eifel": { lat: 50.35, lng: 6.6, label: "Eifel" },
  "rheinland-pfalz": { lat: 50.0, lng: 7.4, label: "Rheinland-Pfalz" },
  "saarland": { lat: 49.4, lng: 6.95, label: "Saarland" },
  "nordrhein-westfalen": { lat: 51.43, lng: 7.66, label: "NRW" },
  "nrw": { lat: 51.43, lng: 7.66, label: "NRW" },
  "niederrhein": { lat: 51.5, lng: 6.42, label: "Niederrhein" },
  "sauerland": { lat: 51.25, lng: 8.13, label: "Sauerland" },
  "niedersachsen": { lat: 52.7, lng: 9.4, label: "Niedersachsen" },
  "hessen": { lat: 50.65, lng: 9.16, label: "Hessen" },
};

const NL_REGIONS: Record<string, Centroid> = {
  "limburg": { lat: 51.22, lng: 5.93, label: "Limburg (NL)" },
};

const TABLES: Record<Country, Record<string, Centroid>> = {
  FR: FR_REGIONS,
  BE: BE_REGIONS,
  DE: DE_REGIONS,
  NL: NL_REGIONS,
};

/**
 * Try to resolve a free-text region to a centroid. Returns null when
 * nothing matches. Match is case-insensitive, accent-tolerant, and accepts
 * partial substring matches so light variations don't miss.
 */
export function lookupRegionCentroid(
  country: Country,
  region: string | null | undefined,
): Centroid | null {
  if (!region) return null;
  const key = normalize(region);
  const table = TABLES[country];
  if (!table) return null;

  // Exact match first.
  if (table[key]) return table[key]!;

  // Substring match — "région grand est" should still hit "grand est".
  for (const [k, v] of Object.entries(table)) {
    if (key.includes(k) || k.includes(key)) return v;
  }
  return null;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}
