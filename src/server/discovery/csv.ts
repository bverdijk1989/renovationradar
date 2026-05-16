/**
 * CSV-parser voor het bulk-importeren van bron-URLs.
 *
 * Doel: een door admin geüploade CSV omzetten naar een lijst rijen die het
 * /api/discovery/import-csv endpoint aan de Discovery Engine kan voeden,
 * gegroepeerd per (country, language).
 *
 * Ondersteund:
 *   - UTF-8 met of zonder BOM (Excel "Save as CSV UTF-8" voegt BOM toe)
 *   - Comma OF puntkomma als delimiter (Europees Excel = puntkomma)
 *   - Quoted fields met "" als ingebedde quote
 *   - LF / CRLF line endings
 *   - Header-row optioneel (single-column URL-bestanden werken zonder)
 *
 * Niet ondersteund: multiline-quoted fields (URL's bevatten geen newlines,
 * dus we keep it simple — een veld eindigt aan het einde van de regel).
 */

import type { Country, Language } from "@prisma/client";

export type CsvRow = {
  url: string;
  /** Optional per-row override van de form-level country. */
  country?: Country;
  language?: Language;
  region?: string;
  note?: string;
  /** 1-indexed regelnummer in het bronbestand (voor error reporting). */
  line: number;
};

export type CsvParseResult = {
  rows: CsvRow[];
  errors: Array<{ line: number; message: string }>;
  delimiter: "," | ";";
  hadHeader: boolean;
};

const VALID_COUNTRIES = new Set(["FR", "BE", "DE", "NL"]);
const VALID_LANGUAGES = new Set(["fr", "nl", "de", "en"]);

const HEADER_ALIASES: Record<string, keyof CsvRow | "skip"> = {
  url: "url",
  website: "url",
  link: "url",
  domain: "url",
  host: "url",
  hostname: "url",
  // Display-naam kolommen: expliciet skip zodat ze niet per ongeluk over de
  // url-kolom heen schrijven als ze later in dezelfde rij staan.
  name: "skip",
  website_name: "skip",
  brand: "skip",
  country: "country",
  land: "country",
  pays: "country",
  language: "language",
  taal: "language",
  langue: "language",
  region: "region",
  regio: "region",
  region_or_focus: "region",
  source_type: "skip",
  priority: "skip",
  priority_for_review: "skip",
  notes: "note",
  note: "note",
  opmerking: "note",
};

export function parseSourcesCsv(text: string): CsvParseResult {
  const errors: Array<{ line: number; message: string }> = [];

  // 1. Strip BOM + normalise line endings.
  const cleaned = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const lines = cleaned.split("\n");

  if (lines.length === 0 || lines.every((l) => l.trim() === "")) {
    return { rows: [], errors, delimiter: ",", hadHeader: false };
  }

  // 2. Detect delimiter from the first non-empty line.
  const firstLine = lines.find((l) => l.trim() !== "") ?? "";
  const delimiter = detectDelimiter(firstLine);

  // 3. Detect header: does the first non-empty row contain a recognised column name?
  const firstFields = parseLine(firstLine, delimiter).map((s) =>
    s.toLowerCase().trim(),
  );
  const hadHeader = firstFields.some((f) => f in HEADER_ALIASES);

  let columnMap: Array<keyof CsvRow | "skip">;
  if (hadHeader) {
    columnMap = firstFields.map((f) => HEADER_ALIASES[f] ?? "skip");
    if (!columnMap.includes("url")) {
      errors.push({
        line: 1,
        message: 'Header ontbreekt een "url" kolom (of synoniem: website, link)',
      });
      return { rows: [], errors, delimiter, hadHeader };
    }
  } else {
    // No header → assume single-column URL list. We'll validate URL per row.
    columnMap = ["url"];
  }

  const dataLines = hadHeader ? lines.slice(1) : lines;
  const startLineNo = hadHeader ? 2 : 1;
  const rows: CsvRow[] = [];

  for (let i = 0; i < dataLines.length; i++) {
    const raw = dataLines[i]!;
    if (raw.trim() === "") continue;
    const lineNo = startLineNo + i;
    const fields = parseLine(raw, delimiter);

    const row: Partial<CsvRow> = { line: lineNo };
    for (let c = 0; c < fields.length; c++) {
      const target = columnMap[c];
      if (!target || target === "skip") continue;
      const value = fields[c]!.trim();
      if (value === "") continue;
      if (target === "country") {
        const upper = value.toUpperCase();
        if (!VALID_COUNTRIES.has(upper)) {
          errors.push({ line: lineNo, message: `Onbekend land "${value}" (verwacht FR/BE/DE/NL)` });
          continue;
        }
        row.country = upper as Country;
      } else if (target === "language") {
        const lower = value.toLowerCase();
        if (!VALID_LANGUAGES.has(lower)) {
          errors.push({ line: lineNo, message: `Onbekende taal "${value}" (verwacht fr/nl/de/en)` });
          continue;
        }
        row.language = lower as Language;
      } else {
        (row as Record<string, string>)[target] = value;
      }
    }

    if (!row.url) {
      errors.push({ line: lineNo, message: "regel mist URL" });
      continue;
    }
    const normalized = normalizeUrl(row.url);
    if (!normalized) {
      errors.push({ line: lineNo, message: `geen geldige URL: "${row.url}"` });
      continue;
    }
    row.url = normalized;
    rows.push(row as CsvRow);
  }

  return { rows, errors, delimiter, hadHeader };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function detectDelimiter(line: string): "," | ";" {
  // Tellen buiten quoted strings — robuuster dan een naïeve split.
  let inQuote = false;
  let commas = 0;
  let semis = 0;
  for (const c of line) {
    if (c === '"') inQuote = !inQuote;
    else if (!inQuote && c === ",") commas++;
    else if (!inQuote && c === ";") semis++;
  }
  // Tie → comma (universele default).
  return semis > commas ? ";" : ",";
}

function parseLine(line: string, delim: "," | ";"): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuote = false;
        }
      } else {
        cur += c;
      }
    } else {
      if (c === '"' && cur.trim() === "") {
        inQuote = true;
      } else if (c === delim) {
        out.push(cur);
        cur = "";
      } else {
        cur += c;
      }
    }
  }
  out.push(cur);
  return out;
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Normalise a CSV-supplied URL:
 *   - "https://immoweb.be" → as-is
 *   - "immoweb.be" → "https://immoweb.be"
 *   - "www.immoweb.be/agenten" → "https://www.immoweb.be/agenten"
 *
 * Auto-prepending https:// is a convenience for human-edited CSVs (Excel,
 * Google Sheets), where the scheme is almost never typed. Returns null when
 * the value is not a parseable hostname even after prepending.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;
  if (!isHttpUrl(withScheme)) return null;
  // Reject schemes-only or no-host values like "https://" or "https:///path".
  try {
    const u = new URL(withScheme);
    if (!u.hostname || !u.hostname.includes(".")) return null;
    return withScheme;
  } catch {
    return null;
  }
}

/**
 * Groepeer rijen op (country, language, region) zodat de Discovery Engine
 * per groep één keer wordt aangeroepen met de juiste taal-defaults.
 *
 * Rijen zonder country/language vallen terug op de form-level defaults.
 */
export function groupByLocale(
  rows: CsvRow[],
  defaults: { country: Country; language: Language; region?: string | null },
): Array<{
  country: Country;
  language: Language;
  region: string | null;
  urls: string[];
  notes: Map<string, string>;
}> {
  const groups = new Map<
    string,
    {
      country: Country;
      language: Language;
      region: string | null;
      urls: string[];
      notes: Map<string, string>;
    }
  >();
  for (const r of rows) {
    const country = r.country ?? defaults.country;
    const language = r.language ?? defaults.language;
    const region = r.region ?? defaults.region ?? null;
    const key = `${country}|${language}|${region ?? ""}`;
    let g = groups.get(key);
    if (!g) {
      g = { country, language, region, urls: [], notes: new Map() };
      groups.set(key, g);
    }
    g.urls.push(r.url);
    if (r.note) g.notes.set(r.url, r.note);
  }
  return [...groups.values()];
}
