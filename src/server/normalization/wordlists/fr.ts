import type { LanguageWordlist } from "./types";

/**
 * French wordlist. Keywords are stored lowercase; the engine lowercases
 * the input text before matching. Order MATTERS for property-type and
 * special-object: most specific first.
 */
export const FR: LanguageWordlist = {
  functionWords: [
    "le", "la", "les", "de", "du", "des", "et", "à", "au", "aux", "est", "dans",
    "avec", "sur", "pour", "par", "en", "un", "une", "ce", "ces", "qui", "que",
    "son", "sa", "ses", "se", "il", "ils", "elle", "elles", "ne", "pas", "plus",
    "vendre", "vente", "maison", "terrain", "propriété",
  ],

  propertyType: {
    longere: ["longère", "longere"],
    farmhouse: ["corps de ferme", "ferme à rénover", "ferme à vendre", "fermette", "ferme"],
    barn: ["grange à rénover", "grange à aménager", "grange"],
    watermill: ["moulin à eau", "moulin hydraulique", "ancien moulin à eau"],
    mill: ["ancien moulin", "moulin à vent", "moulin à vendre", "moulin"],
    station_building: ["ancienne gare", "gare désaffectée", "ancien bâtiment de gare"],
    lock_keeper_house: ["maison éclusière", "maison de l'éclusier", "maison d'éclusier"],
    level_crossing_house: ["maison de garde-barrière", "maison du garde-barrière"],
    lighthouse: ["phare", "gardien de phare"],
    chapel: ["chapelle"],
    monastery: ["monastère", "ancien couvent"],
    manor: ["manoir", "château"],
    mansion: ["maître", "maison de maître"],
    detached_house: [
      "maison individuelle",
      "maison isolée",
      "villa",
      "pavillon",
    ],
    ruin: ["en ruine", "à l'état de ruine"],
  },

  specialObject: {
    watermill: ["moulin à eau", "moulin hydraulique"],
    mill: ["moulin à vent", "ancien moulin", "moulin à vendre"],
    station_building: ["ancienne gare", "gare désaffectée"],
    lock_keeper_house: ["maison éclusière", "maison d'éclusier"],
    level_crossing_house: ["maison de garde-barrière"],
    lighthouse: ["phare", "gardien de phare"],
    chapel: ["chapelle"],
    monastery: ["monastère", "ancien couvent"],
  },

  renovation: {
    ruin: ["en ruine", "ruines", "à l'état de ruine", "à restaurer entièrement"],
    needs_renovation: [
      "à rénover",
      "à restaurer",
      "rénovation à prévoir",
      "gros oeuvre",
      "gros travaux",
      "travaux à prévoir",
      "à remettre en état",
    ],
    partial_renovation: [
      "rénovation partielle",
      "partiellement rénové",
      "en partie rénové",
      "toiture neuve",
      "toiture récente",
      "rénové en partie",
    ],
    move_in_ready: [
      "habitable",
      "prêt à vivre",
      "clé en main",
      "rénové",
      "entièrement rénové",
      "récemment rénové",
    ],
  },

  detached: {
    yes: [
      "maison individuelle",
      "maison isolée",
      "indépendante",
      "4 façades",
      "quatre façades",
      "pavillon",
    ],
    no: [
      "mitoyen",
      "mitoyenne",
      "appartement",
      "rez-de-jardin",
      "duplex",
      "triplex",
    ],
  },

  electricity: {
    present: [
      "électricité raccordée",
      "courant raccordé",
      "raccordé edf",
      "raccordement edf",
      "raccordée électricité",
      "branchement électrique",
    ],
    likely: ["électricité"],
    absent: ["hors réseau", "non raccordé électricité", "sans électricité"],
  },

  water: {
    present: [
      "eau courante",
      "eau de ville",
      "raccordement eau",
      "puits",
      "source privée",
      "cours d'eau privé",
    ],
    likely: ["eau", "rivière", "ruisseau"],
    absent: ["sans eau", "non raccordé eau"],
  },

  nlTranslationHints: [
    [/maison à rénover/i, "te renoveren huis"],
    [/ferme à rénover/i, "te renoveren boerderij"],
    [/corps de ferme/i, "hoeve"],
    [/longère/i, "longère (langgevelboerderij)"],
    [/moulin à eau/i, "watermolen"],
    [/ancien moulin/i, "oude molen"],
    [/moulin/i, "molen"],
    [/ancienne gare/i, "voormalig stationsgebouw"],
    [/maison éclusière/i, "sluiswachterswoning"],
    [/maison de garde-barrière/i, "wachtershuisje (spoorweg)"],
    [/phare/i, "vuurtoren"],
    [/à vendre/i, "te koop"],
    [/avec terrain/i, "met grond"],
    [/à rénover/i, "te renoveren"],
  ],
};
