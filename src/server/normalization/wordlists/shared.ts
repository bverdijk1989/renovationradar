/**
 * Patterns shared across languages: numeric / unit detection.
 *
 * Notes:
 *   - All regexes are case-insensitive and tolerant of non-breaking spaces.
 *   - Numbers can be written with thousand separators (. or , or space) so
 *     `350.000`, `350 000`, `350,000` all parse to 350000.
 *   - The engine assumes EUR for prices unless an explicit different
 *     currency symbol appears (rare for FR/BE/DE listings).
 */

/**
 * Strip thousand separators and parse a localized number. Returns null on
 * failure. Accepts both decimal-comma (FR/BE/DE) and decimal-point inputs.
 *
 * Heuristic: if the string contains BOTH "." and "," we assume the LAST one
 * is the decimal separator. If only one is present and there's exactly one
 * occurrence followed by 1-2 digits, it's the decimal separator; otherwise
 * it's a thousand separator (e.g. "350.000" → 350000, "1.5" → 1.5).
 */
export function parseLocaleNumber(raw: string): number | null {
  if (!raw) return null;
  const s = raw.replace(/\s| /g, "").trim();
  if (!s) return null;

  // Both separators present: the rightmost is the decimal.
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  let normalised = s;
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastDot > lastComma) {
      normalised = s.replace(/,/g, "");
    } else {
      normalised = s.replace(/\./g, "").replace(",", ".");
    }
  } else if (hasComma) {
    // Single ',' followed by exactly 1-2 digits → decimal. Else → thousands.
    const m = s.match(/^[-+]?\d{1,3}(?:,\d{3})+$/);
    if (m) {
      normalised = s.replace(/,/g, "");
    } else {
      normalised = s.replace(",", ".");
    }
  } else if (hasDot) {
    // Single '.' followed by exactly 3 digits at the end → thousand separator
    // (e.g. "350.000"). Multiple dots → thousands. Otherwise decimal.
    const dotCount = (s.match(/\./g) ?? []).length;
    if (dotCount > 1) {
      normalised = s.replace(/\./g, "");
    } else {
      const m = s.match(/^(-?\d{1,3})\.(\d{3})$/);
      if (m) normalised = m[1]! + m[2]!;
    }
  }

  const n = Number.parseFloat(normalised);
  return Number.isFinite(n) ? n : null;
}

/**
 * Price extractor: matches numbers near a currency symbol or word.
 * Returns the FIRST plausible price (≥ 1000 €) found; that's nearly always
 * the asking price in listing copy.
 */
export const PRICE_PATTERNS: RegExp[] = [
  // €350.000  or  € 350 000
  /€\s*([\d][\d.,\s ]{2,15})/i,
  // 350.000 €  or  350 000 EUR
  /([\d][\d.,\s ]{2,15})\s*(?:€|eur(?:o)?s?|euros?)/i,
];

/** Land-area: hectares first (FR/NL/DE all use "ha"), then m². */
export const HECTARE_PATTERNS: RegExp[] = [
  /(\d+(?:[.,]\d+)?)\s*(?:ha|hectares?|hectaren|hektar)\b/i,
];

export const SQUARE_METER_PATTERNS: RegExp[] = [
  /(\d[\d.,\s ]{2,9})\s*m\s*[²2]/i,
  /(\d[\d.,\s ]{2,9})\s*(?:square\s+meters?|vierkante\s+meter)/i,
];

/** Common "rooms" patterns across languages — language extractors override. */
export const ROOMS_PATTERNS: Array<{ regex: RegExp; language: "fr" | "nl" | "de" }> = [
  { regex: /(\d{1,2})\s*pi[èe]ces?/i, language: "fr" },
  { regex: /(\d{1,2})\s*chambres?/i, language: "fr" },
  { regex: /(\d{1,2})\s*kamers?/i, language: "nl" },
  { regex: /(\d{1,2})\s*slaapkamers?/i, language: "nl" },
  { regex: /(\d{1,2})\s*Zimmer/i, language: "de" },
  { regex: /(\d{1,2})\s*Schlafzimmer/i, language: "de" },
];
