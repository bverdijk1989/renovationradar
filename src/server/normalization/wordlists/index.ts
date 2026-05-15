import type { Language } from "@prisma/client";
import type { LanguageWordlist } from "./types";
import { FR } from "./fr";
import { NL } from "./nl";
import { DE } from "./de";

export { FR, NL, DE };
export type { LanguageWordlist };

export function wordlistFor(language: Language): LanguageWordlist {
  switch (language) {
    case "fr":
      return FR;
    case "nl":
      return NL;
    case "de":
      return DE;
    case "en":
      // No EN list yet — fall through to NL so utility/renovation phrases
      // partially match for English-language sources. Real EN list belongs
      // to a future fase if EN sources become important.
      return NL;
  }
}
