import { describe, it, expect } from "vitest";
import { groupByLocale, parseSourcesCsv } from "./csv";

describe("parseSourcesCsv — basics", () => {
  it("parses a single-column URL list without header", () => {
    const csv = `https://a.fr
https://b.fr
https://c.de`;
    const r = parseSourcesCsv(csv);
    expect(r.hadHeader).toBe(false);
    expect(r.rows.map((row) => row.url)).toEqual([
      "https://a.fr",
      "https://b.fr",
      "https://c.de",
    ]);
    expect(r.errors).toEqual([]);
  });

  it("parses a CSV with header and all optional columns", () => {
    const csv = `url,country,language,region,note
https://agence.fr,FR,fr,Lorraine,Aanbevolen
https://makelaar.be,BE,nl,,
https://immobilien.de,DE,de,Eifel,Specialist`;
    const r = parseSourcesCsv(csv);
    expect(r.hadHeader).toBe(true);
    expect(r.rows).toHaveLength(3);
    expect(r.rows[0]).toMatchObject({
      url: "https://agence.fr",
      country: "FR",
      language: "fr",
      region: "Lorraine",
      note: "Aanbevolen",
      line: 2,
    });
    expect(r.rows[1]!.region).toBeUndefined();
    expect(r.rows[1]!.note).toBeUndefined();
  });

  it("detects semicolon delimiter (European Excel)", () => {
    const csv = `url;country;language
https://a.fr;FR;fr
https://b.be;BE;nl`;
    const r = parseSourcesCsv(csv);
    expect(r.delimiter).toBe(";");
    expect(r.rows).toHaveLength(2);
  });

  it("strips UTF-8 BOM", () => {
    const csv = `﻿url\nhttps://x.fr`;
    const r = parseSourcesCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.url).toBe("https://x.fr");
  });

  it("handles CRLF line endings", () => {
    const csv = `url\r\nhttps://a.fr\r\nhttps://b.fr\r\n`;
    const r = parseSourcesCsv(csv);
    expect(r.rows).toHaveLength(2);
  });

  it("skips empty lines", () => {
    const csv = `url
https://a.fr

https://b.fr

`;
    const r = parseSourcesCsv(csv);
    expect(r.rows).toHaveLength(2);
  });
});

describe("parseSourcesCsv — quoted fields", () => {
  it("handles quoted fields with commas inside", () => {
    const csv = `url,note
https://x.fr,"Hello, world"
https://y.fr,"Notitie zonder komma"`;
    const r = parseSourcesCsv(csv);
    expect(r.rows[0]!.note).toBe("Hello, world");
    expect(r.rows[1]!.note).toBe("Notitie zonder komma");
  });

  it("handles embedded quotes via doubling", () => {
    const csv = `url,note
https://x.fr,"She said ""hi"""`;
    const r = parseSourcesCsv(csv);
    expect(r.rows[0]!.note).toBe('She said "hi"');
  });
});

describe("parseSourcesCsv — header aliases", () => {
  it("recognises Dutch + French header names", () => {
    const csv = `website,land,taal,regio,opmerking
https://a.fr,FR,fr,Lorraine,Notitie`;
    const r = parseSourcesCsv(csv);
    expect(r.rows[0]).toMatchObject({
      url: "https://a.fr",
      country: "FR",
      language: "fr",
      region: "Lorraine",
      note: "Notitie",
    });
  });

  it("is case-insensitive on header names", () => {
    const csv = `URL,Country,LANGUAGE
https://a.fr,fr,FR`;
    const r = parseSourcesCsv(csv);
    expect(r.rows[0]!.country).toBe("FR"); // value uppercased
    expect(r.rows[0]!.language).toBe("fr"); // value lowercased
  });
});

describe("parseSourcesCsv — validation errors", () => {
  it("rejects rows without a valid URL", () => {
    const csv = `url,country
not-a-url,FR
https://valid.fr,FR
javascript:alert(1),FR`;
    const r = parseSourcesCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]!.url).toBe("https://valid.fr");
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]!.line).toBe(2);
    expect(r.errors[1]!.line).toBe(4);
  });

  it("rejects unknown country / language values", () => {
    const csv = `url,country,language
https://x.fr,XX,fr
https://y.fr,FR,xx`;
    const r = parseSourcesCsv(csv);
    expect(r.errors.length).toBeGreaterThanOrEqual(2);
    // Row is still kept with the bad value dropped — admin can review.
    expect(r.rows).toHaveLength(2);
    expect(r.rows[0]!.country).toBeUndefined();
    expect(r.rows[1]!.language).toBeUndefined();
  });

  it("returns parse error when header has no url column", () => {
    const csv = `country,language
FR,fr`;
    const r = parseSourcesCsv(csv);
    expect(r.errors[0]!.message).toMatch(/url/i);
    expect(r.rows).toEqual([]);
  });

  it("empty input returns empty result, no crash", () => {
    expect(parseSourcesCsv("").rows).toEqual([]);
    expect(parseSourcesCsv("\n\n\n").rows).toEqual([]);
  });
});

describe("groupByLocale", () => {
  const rows = [
    { url: "https://a.fr", country: "FR" as const, language: "fr" as const, line: 2 },
    { url: "https://b.fr", country: "FR" as const, language: "fr" as const, line: 3 },
    { url: "https://c.de", country: "DE" as const, language: "de" as const, line: 4 },
    { url: "https://d.be", country: "BE" as const, language: "nl" as const, line: 5 },
    { url: "https://e", line: 6 }, // falls back to defaults
  ];

  it("groups by (country, language, region)", () => {
    const groups = groupByLocale(rows, {
      country: "FR",
      language: "fr",
      region: null,
    });
    expect(groups).toHaveLength(3); // FR/fr, DE/de, BE/nl
    const fr = groups.find((g) => g.country === "FR" && g.language === "fr")!;
    expect(fr.urls).toEqual(["https://a.fr", "https://b.fr", "https://e"]);
  });

  it("applies form-level defaults when row omits country/language", () => {
    const groups = groupByLocale([{ url: "https://x.fr", line: 2 }], {
      country: "BE",
      language: "nl",
      region: "Wallonie",
    });
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      country: "BE",
      language: "nl",
      region: "Wallonie",
    });
  });

  it("captures per-URL notes", () => {
    const groups = groupByLocale(
      [
        { url: "https://x.fr", note: "First", line: 2 },
        { url: "https://y.fr", note: "Second", line: 3 },
      ],
      { country: "FR", language: "fr" },
    );
    expect(groups[0]!.notes.get("https://x.fr")).toBe("First");
    expect(groups[0]!.notes.get("https://y.fr")).toBe("Second");
  });
});
