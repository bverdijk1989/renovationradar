"use client";
import { useCallback, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  COUNTRY_LABELS,
  RENOVATION_STATUS_LABELS,
  UTILITY_LABELS,
} from "@/lib/format";

/**
 * Drives the /listings page filters. Stays in sync with the URL so the
 * filtered list is shareable and back/forward navigation works.
 *
 * Filters propagate to the server component via useSearchParams() → router.replace.
 */
export function ListingFilters() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(params.toString());
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      // Reset to page 1 on every filter change.
      next.delete("page");
      startTransition(() => {
        router.replace(`?${next.toString()}`, { scroll: false });
      });
    },
    [params, router],
  );

  const clearAll = useCallback(() => {
    startTransition(() => router.replace("?"));
  }, [router]);

  const current = (key: string) => params.get(key) ?? "";
  const hasAny = Array.from(params.keys()).length > 0;

  return (
    <section
      aria-label="Filters"
      className="sticky top-4 space-y-5 rounded-lg border bg-card p-5 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Filters</h2>
        {hasAny ? (
          <Button variant="ghost" size="sm" onClick={clearAll} disabled={pending}>
            <X className="h-3.5 w-3.5" />
            Wis alles
          </Button>
        ) : null}
      </div>

      {/* Zoeken */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-search">Zoeken</Label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="filter-search"
            placeholder="Titel, stad, adres..."
            defaultValue={current("search")}
            onChange={(e) => setParam("search", e.target.value || null)}
            className="pl-7"
          />
        </div>
      </div>

      {/* Land */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-country">Land</Label>
        <Select
          value={current("country") || "all"}
          onValueChange={(v) => setParam("country", v === "all" ? null : v)}
        >
          <SelectTrigger id="filter-country">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle landen</SelectItem>
            <SelectItem value="FR">{COUNTRY_LABELS.FR}</SelectItem>
            <SelectItem value="BE">{COUNTRY_LABELS.BE}</SelectItem>
            <SelectItem value="DE">{COUNTRY_LABELS.DE}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Prijs */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="filter-min-price">Min. prijs (€)</Label>
          <Input
            id="filter-min-price"
            type="number"
            min={0}
            placeholder="0"
            defaultValue={current("minPriceEur")}
            onChange={(e) => setParam("minPriceEur", e.target.value || null)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="filter-max-price">Max. prijs (€)</Label>
          <Input
            id="filter-max-price"
            type="number"
            min={0}
            placeholder="200000"
            defaultValue={current("maxPriceEur")}
            onChange={(e) => setParam("maxPriceEur", e.target.value || null)}
          />
        </div>
      </div>

      {/* Grond */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-min-land">Min. grond (m²)</Label>
        <Input
          id="filter-min-land"
          type="number"
          min={0}
          placeholder="10000"
          defaultValue={current("minLandM2")}
          onChange={(e) => setParam("minLandM2", e.target.value || null)}
        />
      </div>

      {/* Afstand */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-max-distance">Max. afstand v.a. Venlo (km)</Label>
        <Input
          id="filter-max-distance"
          type="number"
          min={0}
          max={2000}
          placeholder="350"
          defaultValue={current("maxDistanceKm")}
          onChange={(e) => setParam("maxDistanceKm", e.target.value || null)}
        />
      </div>

      {/* Bijzonder object */}
      <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
        <Label htmlFor="filter-special" className="cursor-pointer">
          Alleen bijzondere objecten
        </Label>
        <Switch
          id="filter-special"
          checked={current("isSpecialObject") === "true"}
          onCheckedChange={(checked) =>
            setParam("isSpecialObject", checked ? "true" : null)
          }
        />
      </div>

      {/* Renovatie */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-renovation">Renovatiestatus</Label>
        <Select
          value={current("renovationStatus") || "all"}
          onValueChange={(v) =>
            setParam("renovationStatus", v === "all" ? null : v)
          }
        >
          <SelectTrigger id="filter-renovation">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            {Object.entries(RENOVATION_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stroom */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-electricity">Stroom</Label>
        <Select
          value={current("electricityStatus") || "all"}
          onValueChange={(v) =>
            setParam("electricityStatus", v === "all" ? null : v)
          }
        >
          <SelectTrigger id="filter-electricity">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Maakt niet uit</SelectItem>
            {Object.entries(UTILITY_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Min. match score */}
      <div className="space-y-1.5">
        <Label htmlFor="filter-min-score">Minimale match score</Label>
        <Input
          id="filter-min-score"
          type="number"
          min={0}
          max={100}
          placeholder="0"
          defaultValue={current("minMatchScore")}
          onChange={(e) => setParam("minMatchScore", e.target.value || null)}
        />
      </div>
    </section>
  );
}
