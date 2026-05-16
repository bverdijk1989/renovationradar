"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertCircle, Check, Globe } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Connector-config editor: kies hoe de scraper deze bron benadert.
 *
 * Vier strategieën, elk vertaalt naar de juiste combinatie van
 * `sourceType` + `collectionMethods` + `connectorConfig`:
 *
 *   1. RSS feed       → sourceType=rss,     methods=[rss],   cfg.feedUrl
 *   2. XML sitemap    → sourceType=sitemap, methods=[sitemap], cfg.sitemapUrl + cfg.urlPattern?
 *   3. Generieke HTML → sourceType=scrape,  methods=[scrape_with_permission], cfg.listingPageUrl?
 *   4. Handmatig      → sourceType=manual,  methods=[manual_entry], cfg leeg
 *
 * Strategieën zijn één-op-één; je kunt er maar één tegelijk hebben.
 */

type Strategy = "rss" | "sitemap" | "scrape" | "manual";

function pickStrategy(
  sourceType: string,
  methods: readonly string[],
): Strategy {
  if (sourceType === "rss" || methods.includes("rss")) return "rss";
  if (sourceType === "sitemap" || methods.includes("sitemap")) return "sitemap";
  if (sourceType === "scrape" || methods.includes("scrape_with_permission"))
    return "scrape";
  return "manual";
}

export function SourceConnectorForm({
  sourceId,
  initialSourceType,
  initialCollectionMethods,
  initialConnectorConfig,
  initialWebsite,
}: {
  sourceId: string;
  initialSourceType: string;
  initialCollectionMethods: string[];
  initialConnectorConfig: Record<string, unknown>;
  initialWebsite: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [strategy, setStrategy] = useState<Strategy>(
    pickStrategy(initialSourceType, initialCollectionMethods),
  );
  const [feedUrl, setFeedUrl] = useState(
    typeof initialConnectorConfig.feedUrl === "string"
      ? initialConnectorConfig.feedUrl
      : "",
  );
  const [sitemapUrl, setSitemapUrl] = useState(
    typeof initialConnectorConfig.sitemapUrl === "string"
      ? initialConnectorConfig.sitemapUrl
      : "",
  );
  const [urlPattern, setUrlPattern] = useState(
    typeof initialConnectorConfig.urlPattern === "string"
      ? initialConnectorConfig.urlPattern
      : "",
  );
  const [followLinks, setFollowLinks] = useState(
    initialConnectorConfig.followLinks === true,
  );
  const [listingPageUrl, setListingPageUrl] = useState(
    typeof initialConnectorConfig.listingPageUrl === "string"
      ? initialConnectorConfig.listingPageUrl
      : "",
  );
  const [maxListings, setMaxListings] = useState(
    typeof initialConnectorConfig.maxListings === "number"
      ? String(initialConnectorConfig.maxListings)
      : "50",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const body = buildPatchBody(strategy, {
        feedUrl,
        sitemapUrl,
        urlPattern,
        followLinks,
        listingPageUrl,
        maxListings: Number.parseInt(maxListings, 10) || 50,
      });
      const res = await fetch(`/api/sources/${sourceId}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json?.error?.message ?? `Update mislukt (HTTP ${res.status})`,
        );
      }
      setSavedAt(new Date());
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4" />
          Connector-configuratie
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Vertelt de scraper hoe deze bron benaderd moet worden. Cron-runs
          gebruiken deze instellingen om elke uur listings binnen te halen
          (mits <code>status=active</code> én <code>legalStatus=green</code>).
        </p>

        <div className="space-y-1.5 md:max-w-md">
          <Label htmlFor="strategy">Strategie</Label>
          <Select
            value={strategy}
            onValueChange={(v) => setStrategy(v as Strategy)}
          >
            <SelectTrigger id="strategy">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rss">RSS feed</SelectItem>
              <SelectItem value="sitemap">XML sitemap</SelectItem>
              <SelectItem value="scrape">Generieke HTML-scrape</SelectItem>
              <SelectItem value="manual">Alleen handmatige invoer</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {strategy === "rss" ? (
          <div className="space-y-1.5">
            <Label htmlFor="feedUrl">Feed-URL</Label>
            <Input
              id="feedUrl"
              value={feedUrl}
              onChange={(e) => setFeedUrl(e.target.value)}
              placeholder="https://example.com/feed.xml"
            />
            <p className="text-xs text-muted-foreground">
              RSS 2.0 of Atom. Vereist — kan niet worden afgeleid van de
              homepage.
            </p>
          </div>
        ) : null}

        {strategy === "sitemap" ? (
          <div className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sitemapUrl">Sitemap-URL</Label>
                <Input
                  id="sitemapUrl"
                  value={sitemapUrl}
                  onChange={(e) => setSitemapUrl(e.target.value)}
                  placeholder="https://example.com/sitemap.xml"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="urlPattern">URL-filter (optioneel)</Label>
                <Input
                  id="urlPattern"
                  value={urlPattern}
                  onChange={(e) => setUrlPattern(e.target.value)}
                  placeholder="/property/"
                />
                <p className="text-xs text-muted-foreground">
                  Alleen URLs die deze substring bevatten worden opgepikt.
                </p>
              </div>
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={followLinks}
                onChange={(e) => setFollowLinks(e.target.checked)}
                className="mt-1 h-4 w-4"
              />
              <span>
                <strong>Volg links binnen sitemap-entries</strong> (depth-2 crawl)
                <p className="text-xs text-muted-foreground">
                  Aanvinken als de sitemap city-/categorie-overzichten bevat
                  in plaats van individuele properties. De scraper fetcht dan
                  elke entry en haalt detail-links eruit. Veel duurder
                  (cap: 100 properties per run i.p.v. 1000 sitemap-URLs).
                </p>
              </span>
            </label>
          </div>
        ) : null}

        {strategy === "scrape" ? (
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="listingPageUrl">
                Aanbod-pagina URL (optioneel)
              </Label>
              <Input
                id="listingPageUrl"
                value={listingPageUrl}
                onChange={(e) => setListingPageUrl(e.target.value)}
                placeholder={`bv. ${initialWebsite.replace(/\/$/, "")}/te-koop`}
              />
              <p className="text-xs text-muted-foreground">
                Direct startpunt van de scraper. Leeg laten = scraper start op
                de homepage en zoekt zelf naar listing-links via heuristieken
                (te-koop / à-vendre / for-sale / zu-verkaufen).
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="maxListings">Max listings per run</Label>
              <Input
                id="maxListings"
                type="number"
                min={1}
                max={500}
                value={maxListings}
                onChange={(e) => setMaxListings(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Veiligheidskap. 50 is een redelijke standaard.
              </p>
            </div>
          </div>
        ) : null}

        {strategy === "manual" ? (
          <p className="rounded-md border border-border/60 bg-muted/40 p-3 text-sm text-muted-foreground">
            Geen automatische fetch. Listings worden toegevoegd via{" "}
            <code>POST /api/listings/manual</code> of de admin-UI.
          </p>
        ) : null}

        {error ? (
          <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        {savedAt ? (
          <p className="flex items-center gap-1.5 text-sm text-emerald-600">
            <Check className="h-4 w-4" />
            Opgeslagen om {savedAt.toLocaleTimeString()}
          </p>
        ) : null}

        <div className="flex justify-end">
          <Button onClick={save} disabled={busy}>
            <Save className="mr-1 h-4 w-4" />
            {busy ? "Opslaan…" : "Opslaan"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function buildPatchBody(
  strategy: Strategy,
  vals: {
    feedUrl: string;
    sitemapUrl: string;
    urlPattern: string;
    followLinks: boolean;
    listingPageUrl: string;
    maxListings: number;
  },
): Record<string, unknown> {
  switch (strategy) {
    case "rss":
      return {
        sourceType: "rss",
        collectionMethods: ["rss"],
        connectorConfig: { feedUrl: vals.feedUrl.trim() },
      };
    case "sitemap":
      return {
        sourceType: "sitemap",
        collectionMethods: ["sitemap"],
        connectorConfig: {
          sitemapUrl: vals.sitemapUrl.trim(),
          ...(vals.urlPattern.trim()
            ? { urlPattern: vals.urlPattern.trim() }
            : {}),
          ...(vals.followLinks ? { followLinks: true } : {}),
        },
      };
    case "scrape":
      return {
        sourceType: "scrape",
        collectionMethods: ["scrape_with_permission"],
        connectorConfig: {
          ...(vals.listingPageUrl.trim()
            ? { listingPageUrl: vals.listingPageUrl.trim() }
            : {}),
          maxListings: vals.maxListings,
        },
      };
    case "manual":
      return {
        sourceType: "manual",
        collectionMethods: ["manual_entry"],
        connectorConfig: null,
      };
  }
}
