import "server-only";
import type { Source } from "@prisma/client";
import { prisma } from "@/lib/db";
import { FetchTransport, type HttpTransport } from "@/server/connectors/transport";

/**
 * Feed-detection: zoek voor een gegeven bron naar een gestructureerde
 * data-feed (sitemap.xml of RSS), zodat de SitemapConnector of RssConnector
 * gebruikt kan worden in plaats van de fragiele HTML-scraper.
 *
 * Detectie-volgorde:
 *   1. /robots.txt → "Sitemap: <url>" directives (de canonical bron)
 *   2. Gangbare sitemap-paden: /sitemap.xml, /sitemap_index.xml, /sitemap-index.xml
 *   3. Gangbare RSS-paden: /feed, /feed.xml, /rss, /rss.xml
 *
 * Elke kandidaat-URL wordt HEAD/GET'd en geverifieerd: status 200 + content
 * lijkt op het verwachte type (XML voor sitemap, XML/RSS voor feed).
 *
 * Bij meerdere sitemaps: pakt de eerste; admins kunnen via de UI handmatig
 * overschrijven.
 */
export type FeedDetectionResult = {
  sitemapUrl: string | null;
  rssUrl: string | null;
  evidence: string[];
};

const SITEMAP_FALLBACK_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/sitemap-index.xml",
  "/sitemap/sitemap.xml",
];
const RSS_FALLBACK_PATHS = [
  "/feed",
  "/feed.xml",
  "/rss",
  "/rss.xml",
  "/atom.xml",
];

export async function detectFeeds(
  source: Source,
  transport: HttpTransport = new FetchTransport(),
): Promise<FeedDetectionResult> {
  const evidence: string[] = [];
  const baseUrl = new URL(source.website);

  let sitemapUrl: string | null = null;
  let rssUrl: string | null = null;

  // 1. robots.txt eerst — daar staat de canonical sitemap-URL meestal in.
  try {
    const robotsUrl = new URL("/robots.txt", baseUrl).toString();
    const res = await transport.get(robotsUrl);
    const matches = [...res.body.matchAll(/^\s*sitemap:\s*(\S+)\s*$/gim)];
    if (matches.length > 0) {
      const candidate = matches[0]![1]!.trim();
      try {
        const url = new URL(candidate, baseUrl).toString();
        if (await isXmlResponse(url, transport)) {
          sitemapUrl = url;
          evidence.push(`robots.txt declared sitemap: ${url}`);
        } else {
          evidence.push(`robots.txt sitemap ${url} returned non-xml`);
        }
      } catch {
        evidence.push(`robots.txt sitemap URL niet parseerbaar: ${candidate}`);
      }
    }
  } catch (e) {
    evidence.push(`robots.txt fetch faalde: ${(e as Error).message}`);
  }

  // 2. Gangbare sitemap-paden als fallback.
  if (!sitemapUrl) {
    for (const path of SITEMAP_FALLBACK_PATHS) {
      const url = new URL(path, baseUrl).toString();
      if (await isXmlResponse(url, transport)) {
        sitemapUrl = url;
        evidence.push(`sitemap fallback-pad: ${url}`);
        break;
      }
    }
  }

  // 3. RSS fallback-paden (alleen relevant als geen sitemap; RSS levert
  //    meestal kleinere subset op).
  if (!sitemapUrl) {
    for (const path of RSS_FALLBACK_PATHS) {
      const url = new URL(path, baseUrl).toString();
      if (await isRssResponse(url, transport)) {
        rssUrl = url;
        evidence.push(`rss fallback-pad: ${url}`);
        break;
      }
    }
  }

  return { sitemapUrl, rssUrl, evidence };
}

/**
 * Detecteer feeds en pas ze toe op een Source row. Schrijft sourceType,
 * collectionMethods en connectorConfig in één transactie.
 *
 * Doet niets als de bron al een expliciete `feedUrl` of `sitemapUrl` in
 * connectorConfig heeft staan — dan respecteren we de admin's keuze.
 *
 * Retourneert de bijgewerkte source én een evidence-log voor diagnostiek.
 */
export async function applyDetectedFeeds(
  sourceId: string,
  transport?: HttpTransport,
): Promise<{ source: Source; applied: "sitemap" | "rss" | "none"; evidence: string[] }> {
  const source = await prisma.source.findUnique({ where: { id: sourceId } });
  if (!source) {
    return { source: source!, applied: "none", evidence: ["source not found"] };
  }

  const cfg = (source.connectorConfig ?? {}) as {
    sitemapUrl?: unknown;
    feedUrl?: unknown;
  };
  if (
    typeof cfg.sitemapUrl === "string" ||
    typeof cfg.feedUrl === "string"
  ) {
    return {
      source,
      applied: "none",
      evidence: ["source heeft al een feed/sitemap-config — gerespecteerd"],
    };
  }

  const result = await detectFeeds(source, transport);

  if (result.sitemapUrl) {
    const updated = await prisma.source.update({
      where: { id: sourceId },
      data: {
        sourceType: "sitemap",
        collectionMethods: ["sitemap"],
        connectorConfig: { sitemapUrl: result.sitemapUrl } as never,
      },
    });
    return { source: updated, applied: "sitemap", evidence: result.evidence };
  }
  if (result.rssUrl) {
    const updated = await prisma.source.update({
      where: { id: sourceId },
      data: {
        sourceType: "rss",
        collectionMethods: ["rss"],
        connectorConfig: { feedUrl: result.rssUrl } as never,
      },
    });
    return { source: updated, applied: "rss", evidence: result.evidence };
  }
  return { source, applied: "none", evidence: result.evidence };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function isXmlResponse(
  url: string,
  transport: HttpTransport,
): Promise<boolean> {
  try {
    const res = await transport.get(url);
    if (!res.body || res.body.length < 30) return false;
    const head = res.body.slice(0, 500).toLowerCase();
    return (
      head.includes("<urlset") ||
      head.includes("<sitemapindex") ||
      (head.includes("<?xml") && (head.includes("sitemap") || head.includes("urlset")))
    );
  } catch {
    return false;
  }
}

async function isRssResponse(
  url: string,
  transport: HttpTransport,
): Promise<boolean> {
  try {
    const res = await transport.get(url);
    if (!res.body || res.body.length < 30) return false;
    const head = res.body.slice(0, 500).toLowerCase();
    return (
      head.includes("<rss") ||
      head.includes("<feed") ||
      head.includes("<channel")
    );
  } catch {
    return false;
  }
}
