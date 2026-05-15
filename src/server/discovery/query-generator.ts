import type { Country, Language } from "@prisma/client";

/**
 * Generate a small but useful query list per (country, language[, region]).
 * Deterministic — the same input always produces the same queries, in the
 * same order. Tests rely on this.
 *
 * The templates mix:
 *   1. Direct agency searches ("agence immobilière {region}")
 *   2. Directory / list discovery ("annuaire des agences immobilières")
 *   3. Rural-specific terms because that's the brief's bias
 *
 * A SearchAPI provider feeds these to e.g. Bing Web Search; ManualImport
 * ignores them (admin pastes URLs directly).
 */

const FR_TEMPLATES: ReadonlyArray<(r: string) => string> = [
  (r) => `agence immobilière ${r}`,
  (r) => `immobilier rural ${r}`,
  (r) => `agent immobilier ${r}`,
  (r) => `vente longère ferme ${r}`,
  (r) => `annuaire agences immobilières ${r}`,
];

const FR_GLOBAL: ReadonlyArray<string> = [
  "annuaire agences immobilières France",
  "agences immobilières rurales France",
  "site:.fr agence immobilière",
];

const NL_TEMPLATES: ReadonlyArray<(r: string) => string> = [
  (r) => `makelaar ${r}`,
  (r) => `vastgoedkantoor ${r}`,
  (r) => `landelijk vastgoed ${r}`,
  (r) => `hoeve te koop makelaar ${r}`,
  (r) => `lijst makelaars ${r}`,
];

const NL_GLOBAL: ReadonlyArray<string> = [
  "overzicht makelaars België",
  "kleine makelaars Wallonië",
];

const DE_TEMPLATES: ReadonlyArray<(r: string) => string> = [
  (r) => `Immobilienmakler ${r}`,
  (r) => `Immobilien ${r} Bauernhaus`,
  (r) => `Resthof Makler ${r}`,
  (r) => `Immobilienbüro ${r}`,
  (r) => `Verzeichnis Immobilienmakler ${r}`,
];

const DE_GLOBAL: ReadonlyArray<string> = [
  "Verzeichnis kleiner Immobilienmakler Deutschland",
  "Resthof Immobilien Maklerverzeichnis",
];

/**
 * Per-country default regions used when the caller doesn't pass a `region`.
 * Picked to roughly match the brief's 350 km radius from Venlo.
 */
const DEFAULT_REGIONS: Record<Country, string[]> = {
  FR: ["Lorraine", "Champagne-Ardenne", "Ardennes", "Picardie"],
  BE: ["Wallonie", "Liège", "Namur", "Hainaut", "Luxembourg belge"],
  DE: ["Eifel", "Niederrhein", "Sauerland", "Rheinland-Pfalz"],
  NL: ["Limburg"], // included for completeness; unlikely to be searched
};

export function generateQueries(input: {
  country: Country;
  language: Language;
  region?: string | null;
}): string[] {
  const regions = input.region ? [input.region] : DEFAULT_REGIONS[input.country];
  const out: string[] = [];

  const templates =
    input.language === "fr" ? FR_TEMPLATES :
    input.language === "nl" ? NL_TEMPLATES :
    input.language === "de" ? DE_TEMPLATES : FR_TEMPLATES;

  const globals =
    input.language === "fr" ? FR_GLOBAL :
    input.language === "nl" ? NL_GLOBAL :
    input.language === "de" ? DE_GLOBAL : [];

  for (const region of regions) {
    for (const tpl of templates) out.push(tpl(region));
  }
  out.push(...globals);

  // Dedup while preserving order.
  return Array.from(new Set(out));
}
