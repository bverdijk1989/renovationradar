import type { Language } from "@prisma/client";

/**
 * Metadata extractor — turns raw HTML into the brief's required fields:
 *   - name, language, email, phone, listing-page hint.
 *
 * Strict about what counts as "public business contact info":
 *   - Email: only `mailto:` links AND addresses containing the domain or
 *     standard role addresses (info@, contact@, …). We do not scrape
 *     personal-name addresses that might accidentally be in page text.
 *   - Phone: only `tel:` links. We don't try to parse loose phone numbers
 *     from body text — too noisy, too easy to grab the wrong number.
 *
 * This conservative stance is by design: the brief says "indien zakelijk
 * en publiek". When in doubt, omit.
 */

export type ExtractedMetadata = {
  name: string | null;
  language: Language | null;
  email: string | null;
  phone: string | null;
  /** Best-guess URL of the page that LISTS properties (used by connectors). */
  listingPageUrl: string | null;
  region: string | null;
};

const LISTING_URL_PATTERNS: RegExp[] = [
  /\/annonces?\b/i,
  /\/biens?\b/i,
  /\/immo(?:bilier)?\b/i,
  /\/listings?\b/i,
  /\/te-koop\b/i,
  /\/aanbod\b/i,
  /\/objekte\b/i,
  /\/immobilien\b/i,
  /\/properties?\b/i,
];

const ROLE_LOCAL_PARTS = new Set([
  "info",
  "contact",
  "hello",
  "bonjour",
  "office",
  "sales",
  "vente",
  "verkoop",
  "agence",
  "secretariat",
  "kontakt",
]);

export function extract(input: {
  url: string;
  html: string;
  hintLanguage?: Language | null;
}): ExtractedMetadata {
  const html = input.html;
  const host = safeHost(input.url);

  return {
    name: extractName(html, host),
    language: input.hintLanguage ?? extractLanguage(html),
    email: extractEmail(html, host),
    phone: extractPhone(html),
    listingPageUrl: extractListingUrl(html, input.url),
    region: extractRegion(html),
  };
}

// ---------------------------------------------------------------------------
// Per-field extractors
// ---------------------------------------------------------------------------

function extractName(html: string, host: string | null): string | null {
  // <meta property="og:site_name"> wins — sites curate it carefully.
  const og = readMeta(html, "og:site_name");
  if (og) return clean(og);

  // Then <title>, but trim common suffixes ("- Home", "| Site Name").
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) {
    const raw = titleMatch[1]!.trim();
    const cleaned = raw.split(/[|\-—–·]/)[0]!.trim();
    if (cleaned.length > 0 && cleaned.length < 120) return clean(cleaned);
  }

  // Last resort: title-case the host.
  if (host) {
    return host.replace(/\.[a-z]{2,}$/, "").replace(/[-_]/g, " ");
  }
  return null;
}

function extractLanguage(html: string): Language | null {
  // <html lang="fr">
  const langAttr = html.match(/<html[^>]*\blang\s*=\s*"([a-z]{2})/i);
  if (langAttr) {
    const v = langAttr[1]!.toLowerCase();
    if (v === "fr" || v === "nl" || v === "de" || v === "en") return v;
  }
  // <meta http-equiv="content-language" content="fr-FR">
  const meta = readMeta(html, "content-language");
  if (meta) {
    const v = meta.slice(0, 2).toLowerCase();
    if (v === "fr" || v === "nl" || v === "de" || v === "en") return v;
  }
  return null;
}

function extractEmail(html: string, host: string | null): string | null {
  // Only trust mailto: links — they're explicit publication of an address.
  const mailtos: string[] = [];
  const re = /mailto:([^"'\s<>]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const addr = m[1]!.split("?")[0]!.trim().toLowerCase();
    if (addr.includes("@")) mailtos.push(addr);
  }
  if (mailtos.length === 0) return null;

  // Prefer a domain-matching role address: info@<host>, contact@<host>.
  if (host) {
    const sameDomain = mailtos.filter((a) => a.endsWith(`@${host}`));
    const roleSame = sameDomain.find((a) => ROLE_LOCAL_PARTS.has(a.split("@")[0]!));
    if (roleSame) return roleSame;
    if (sameDomain.length > 0) return sameDomain[0]!;
  }
  // Otherwise just the first one.
  return mailtos[0] ?? null;
}

function extractPhone(html: string): string | null {
  const m = html.match(/tel:([+\d\s().-]{6,30})/i);
  if (!m) return null;
  // Strip whitespace and ornamental chars but keep + and digits.
  const cleaned = m[1]!.replace(/[^\d+]/g, "");
  if (cleaned.length < 6) return null;
  return cleaned;
}

function extractListingUrl(html: string, base: string): string | null {
  // Scan all <a href=...> for paths matching listing-y patterns.
  const re = /<a[^>]+href\s*=\s*["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]!;
    if (!LISTING_URL_PATTERNS.some((p) => p.test(href))) continue;
    try {
      const abs = new URL(href, base);
      return abs.toString();
    } catch {
      continue;
    }
  }
  return null;
}

function extractRegion(html: string): string | null {
  // Heuristic: look for <meta name="geo.region"> or <meta name="region">.
  const geo = readMeta(html, "geo.region") ?? readMeta(html, "region");
  if (geo) return clean(geo);
  // Fallback: <address> tag's first line (often "City, Region").
  const addr = html.match(/<address[^>]*>([\s\S]*?)<\/address>/i);
  if (addr) {
    const text = addr[1]!.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    if (text.length > 0 && text.length < 200) return text;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readMeta(html: string, name: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property|http-equiv)\\s*=\\s*"${escape(name)}"[^>]*content\\s*=\\s*"([^"]*)"`, "i"),
    new RegExp(`<meta[^>]+content\\s*=\\s*"([^"]*)"[^>]*(?:name|property|http-equiv)\\s*=\\s*"${escape(name)}"`, "i"),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1]!;
  }
  return null;
}

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function clean(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}
