import type { LanguageWordlist } from "./types";

export const NL: LanguageWordlist = {
  functionWords: [
    "de", "het", "een", "en", "van", "in", "op", "te", "voor", "met", "ook",
    "wordt", "is", "zijn", "dat", "deze", "dit", "hier", "naar", "uit", "om",
    "bij", "door", "over", "of", "als", "maar", "aan", "kunnen", "moet",
    "woning", "huis", "grond", "verkoop",
  ],

  propertyType: {
    watermill: ["watermolen"],
    mill: ["windmolen", "molen"],
    station_building: ["stationsgebouw", "voormalig station", "oud station"],
    lock_keeper_house: ["sluiswachterswoning", "sluiswachters woning"],
    lighthouse: ["vuurtoren", "vuurtorenwachterswoning"],
    chapel: ["kapel"],
    monastery: ["klooster"],
    farmhouse: ["boerderij", "hoeve", "vierkantshoeve"],
    longere: ["langgevelboerderij"],
    barn: ["schuur"],
    manor: ["kasteel"],
    mansion: ["landhuis", "herenhuis"],
    detached_house: ["vrijstaande woning", "vrijstaand huis", "vrijstaand", "villa"],
    ruin: ["ruïne", "ruine"],
  },

  specialObject: {
    watermill: ["watermolen"],
    mill: ["windmolen", "molen te koop"],
    station_building: ["stationsgebouw"],
    lock_keeper_house: ["sluiswachterswoning"],
    lighthouse: ["vuurtoren", "vuurtorenwachterswoning"],
    chapel: ["kapel"],
    monastery: ["klooster"],
  },

  renovation: {
    ruin: ["ruïne", "ruine", "casco"],
    needs_renovation: [
      "opknapwoning",
      "renovatiewoning",
      "te renoveren",
      "opknapper",
      "klushuis",
      "renovatie nodig",
      "veel achterstallig onderhoud",
    ],
    partial_renovation: [
      "deels gerenoveerd",
      "gedeeltelijk gerenoveerd",
      "deels gerestaureerd",
      "nieuw dak",
    ],
    move_in_ready: [
      "instapklaar",
      "recent gerenoveerd",
      "volledig gerenoveerd",
      "kant en klaar",
    ],
  },

  detached: {
    yes: ["vrijstaand", "vrijstaande woning", "vrij staand", "alleenstaand"],
    no: ["tussenwoning", "hoekwoning", "rijwoning", "appartement", "geschakeld"],
  },

  electricity: {
    present: ["stroom aanwezig", "aansluiting elektriciteit", "elektriciteit aanwezig"],
    likely: ["elektriciteit"],
    absent: ["geen stroom", "zonder elektriciteit"],
  },

  water: {
    present: ["water aanwezig", "drinkwater", "wateraansluiting", "eigen put", "eigen waterbron"],
    likely: ["water", "beek", "rivier op het perceel"],
    absent: ["geen water"],
  },

  nlTranslationHints: [
    // NL → NL is identity; we still include common normalisations.
    [/opknapwoning/i, "opknapwoning"],
    [/te renoveren woning/i, "te renoveren woning"],
  ],
};
