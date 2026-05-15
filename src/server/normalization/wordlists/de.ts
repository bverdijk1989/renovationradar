import type { LanguageWordlist } from "./types";

export const DE: LanguageWordlist = {
  functionWords: [
    "der", "die", "das", "und", "von", "in", "auf", "für", "mit", "ist",
    "sind", "dem", "den", "ein", "eine", "einem", "einer", "eines", "sich",
    "nicht", "auch", "wird", "werden", "wurde", "haus", "grundstück", "verkauf",
    "zum", "zur", "im", "am",
  ],

  propertyType: {
    watermill: ["wassermühle", "wassermuehle"],
    mill: ["windmühle", "mühle", "muehle"],
    station_building: ["bahnhofsgebäude", "alter bahnhof", "ehemaliger bahnhof", "bahnhof"],
    lock_keeper_house: ["schleusenwärterhaus", "schleusenwaerterhaus", "schleusenhaus"],
    level_crossing_house: ["bahnwärterhaus", "bahnwaerterhaus"],
    lighthouse: ["leuchtturm"],
    chapel: ["kapelle"],
    monastery: ["kloster", "ehemaliges kloster"],
    farmhouse: ["bauernhaus", "resthof", "hof", "vierseithof", "dreiseithof"],
    barn: ["scheune"],
    manor: ["herrenhaus", "schloss"],
    mansion: ["landhaus", "gutshaus"],
    detached_house: [
      "freistehendes haus",
      "einfamilienhaus",
      "villa",
      "alleinstehendes haus",
      "alleinlage",
    ],
    ruin: ["ruine"],
  },

  specialObject: {
    watermill: ["wassermühle", "wassermuehle"],
    mill: ["windmühle", "mühle kaufen"],
    station_building: ["bahnhofsgebäude", "alter bahnhof", "ehemaliger bahnhof"],
    lock_keeper_house: ["schleusenwärterhaus", "schleusenhaus"],
    level_crossing_house: ["bahnwärterhaus"],
    lighthouse: ["leuchtturm"],
    chapel: ["kapelle"],
    monastery: ["kloster"],
  },

  renovation: {
    ruin: ["ruine", "ruinös", "abriss"],
    needs_renovation: [
      "renovierungsbedürftig",
      "sanierungsbedürftig",
      "sanierung erforderlich",
      "renovierung notwendig",
      "stark sanierungsbedürftig",
    ],
    partial_renovation: [
      "teilsaniert",
      "teilrenoviert",
      "teilweise saniert",
      "dach neu",
      "neues dach",
    ],
    move_in_ready: [
      "bezugsfertig",
      "sofort beziehbar",
      "vollständig saniert",
      "kernsaniert",
      "neuwertig",
    ],
  },

  detached: {
    yes: [
      "freistehend",
      "freistehendes haus",
      "einfamilienhaus",
      "alleinstehend",
      "alleinlage",
    ],
    no: [
      "reihenhaus",
      "doppelhaus",
      "doppelhaushälfte",
      "etagenwohnung",
      "wohnung",
    ],
  },

  electricity: {
    present: [
      "stromanschluss",
      "strom vorhanden",
      "strom anliegend",
      "stromanschluss vorhanden",
    ],
    likely: ["strom"],
    absent: ["kein stromanschluss", "ohne strom"],
  },

  water: {
    present: [
      "wasseranschluss",
      "wasser vorhanden",
      "brunnen",
      "eigene quelle",
      "trinkwasser",
    ],
    likely: ["wasser", "bach", "fluss"],
    absent: ["kein wasseranschluss", "ohne wasser"],
  },

  nlTranslationHints: [
    [/wassermühle/i, "watermolen"],
    [/wassermuehle/i, "watermolen"],
    [/windmühle/i, "windmolen"],
    [/mühle/i, "molen"],
    [/muehle/i, "molen"],
    [/bahnhofsgebäude/i, "stationsgebouw"],
    [/schleusenwärterhaus/i, "sluiswachterswoning"],
    [/leuchtturm/i, "vuurtoren"],
    [/bauernhaus/i, "boerderij"],
    [/resthof/i, "resthof (afgelegen boerderij)"],
    [/freistehendes haus/i, "vrijstaande woning"],
    [/zu verkaufen/i, "te koop"],
    [/sanierungsbedürftig/i, "renovatie nodig"],
    [/renovierungsbedürftig/i, "te renoveren"],
    [/teilsaniert/i, "gedeeltelijk gerenoveerd"],
  ],
};
