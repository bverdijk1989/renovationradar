/**
 * Tiny XML helpers — just enough for RSS and sitemap parsing.
 *
 * Why hand-roll instead of pulling in xml2js / fast-xml-parser?
 *   - Two parsers, two dependencies, both with their own oddities.
 *   - We control exactly which fields we extract, no surprises.
 *   - The RSS/sitemap subset we care about is trivial (no nesting beyond
 *     <item>/<channel>, no namespaces beyond the ones we explicitly handle).
 *
 * If a source ships malformed XML, the connector raises a ParseError — the
 * runner converts that into a failed CrawlJob, surfacing the bad URL.
 */

import { ParseError } from "./errors";

/** Strip CDATA wrapping. RSS/sitemap commonly wrap free text in CDATA. */
export function stripCdata(s: string): string {
  return s.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "");
}

/** Decode the 5 XML entities we care about. */
export function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&"); // amp last so we don't double-decode entities
}

/**
 * Extract text content of the FIRST <tag>...</tag> child of `block`.
 * Tolerant: ignores XML namespaces (treats `<dc:date>` same as `<date>`).
 * Returns null if no match.
 */
export function readTag(block: string, tag: string): string | null {
  const re = new RegExp(
    `<(?:[a-zA-Z][\\w-]*:)?${escapeRegex(tag)}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z][\\w-]*:)?${escapeRegex(tag)}>`,
    "i",
  );
  const m = block.match(re);
  if (!m) return null;
  return decodeXmlEntities(stripCdata(m[1]!.trim()));
}

/**
 * Read an attribute on the FIRST <tag .../> or <tag>...</tag> in `block`.
 */
export function readAttr(block: string, tag: string, attr: string): string | null {
  const re = new RegExp(
    `<(?:[a-zA-Z][\\w-]*:)?${escapeRegex(tag)}([^>]*)>`,
    "i",
  );
  const m = block.match(re);
  if (!m) return null;
  const attrRe = new RegExp(`${escapeRegex(attr)}\\s*=\\s*"([^"]*)"`, "i");
  const a = m[1]!.match(attrRe);
  return a ? decodeXmlEntities(a[1]!) : null;
}

/**
 * Return every `<tag>...</tag>` block in `xml` (outer match including the
 * surrounding tags). Order preserved.
 */
export function splitBlocks(xml: string, tag: string): string[] {
  const re = new RegExp(
    `<(?:[a-zA-Z][\\w-]*:)?${escapeRegex(tag)}(?:\\s[^>]*)?>[\\s\\S]*?</(?:[a-zA-Z][\\w-]*:)?${escapeRegex(tag)}>`,
    "gi",
  );
  return xml.match(re) ?? [];
}

export function assertXmlLooksValid(body: string, expectedRoot: string): void {
  if (!body || body.trim().length === 0) {
    throw new ParseError(`Empty response — expected <${expectedRoot}>`);
  }
  // Loose check: somewhere in the body there's an opening tag for the root.
  const re = new RegExp(`<(?:[a-zA-Z][\\w-]*:)?${escapeRegex(expectedRoot)}\\b`, "i");
  if (!re.test(body)) {
    throw new ParseError(
      `Response does not look like ${expectedRoot} XML (no <${expectedRoot}> tag found)`,
      { bodyPreview: body.slice(0, 300) },
    );
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
