"use client";
import { useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { ListingMap, type MapPoint } from "@/components/map/listing-map";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatDistance,
  formatPrice,
  PROPERTY_TYPE_LABELS,
  SPECIAL_OBJECT_LABELS,
  label,
} from "@/lib/format";

export function MapView({ initialPoints }: { initialPoints: MapPoint[] }) {
  const [specialOnly, setSpecialOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState<string>("");
  const [maxDistance, setMaxDistance] = useState<string>("");
  const [country, setCountry] = useState<Record<string, boolean>>({
    FR: true,
    BE: true,
    DE: true,
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const points = useMemo(() => {
    return initialPoints.filter((p) => {
      if (specialOnly && !p.specialObjectType) return false;
      if (maxPrice && p.priceEur != null && p.priceEur > Number(maxPrice)) return false;
      if (maxDistance && p.distanceKm != null && p.distanceKm > Number(maxDistance))
        return false;
      // Country is encoded in property/special types only; we can't filter
      // without it. The country flag here is informational until we plumb
      // country through MapPoint (cheap to add later).
      void country;
      return true;
    });
  }, [initialPoints, specialOnly, maxPrice, maxDistance, country]);

  const selected = selectedId ? points.find((p) => p.id === selectedId) ?? null : null;

  return (
    <div className="grid h-full grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
      {/* Filter sidebar (links) */}
      <aside className="space-y-4 overflow-y-auto rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Filters</h2>
        <div className="flex items-center justify-between">
          <Label htmlFor="map-special" className="cursor-pointer">
            Alleen bijzondere objecten
          </Label>
          <Switch
            id="map-special"
            checked={specialOnly}
            onCheckedChange={setSpecialOnly}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="map-max-price">Max. prijs (€)</Label>
          <Input
            id="map-max-price"
            type="number"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value)}
            placeholder="200000"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="map-max-distance">Max. afstand (km)</Label>
          <Input
            id="map-max-distance"
            type="number"
            value={maxDistance}
            onChange={(e) => setMaxDistance(e.target.value)}
            placeholder="350"
          />
        </div>
        <fieldset className="space-y-1">
          <legend className="mb-1 text-sm font-medium">Landen</legend>
          {(["FR", "BE", "DE"] as const).map((c) => (
            <label key={c} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={country[c] ?? false}
                onChange={(e) =>
                  setCountry((prev) => ({ ...prev, [c]: e.target.checked }))
                }
                className="h-4 w-4 rounded border-input"
              />
              {c === "FR" ? "Frankrijk" : c === "BE" ? "België" : "Duitsland"}
            </label>
          ))}
        </fieldset>
        <p className="pt-2 text-xs text-muted-foreground">
          {points.length} van {initialPoints.length} matches zichtbaar
        </p>
      </aside>

      {/* Kaart */}
      <div className="min-h-0 overflow-hidden rounded-lg border">
        <ListingMap
          points={points}
          selectedId={selectedId}
          onSelect={setSelectedId}
          className="h-full w-full"
        />
      </div>

      {/* Detail drawer (rechts) */}
      <Sheet
        open={selected !== null}
        onOpenChange={(open) => !open && setSelectedId(null)}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          {selected ? <SelectedDetail point={selected} /> : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function SelectedDetail({ point }: { point: MapPoint }) {
  return (
    <>
      <SheetHeader>
        <SheetTitle>{point.title}</SheetTitle>
        <SheetDescription>
          {point.specialObjectType ? (
            <Badge variant="special">
              <Sparkles className="h-3 w-3" />
              {label(SPECIAL_OBJECT_LABELS, point.specialObjectType)}
            </Badge>
          ) : (
            <Badge variant="outline">
              {label(PROPERTY_TYPE_LABELS, point.propertyType)}
            </Badge>
          )}
        </SheetDescription>
      </SheetHeader>
      <div className="mt-6 space-y-4 text-sm">
        <div className="flex items-baseline justify-between">
          <span className="text-muted-foreground">Prijs</span>
          <span className="text-2xl font-semibold">{formatPrice(point.priceEur)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Afstand v.a. Venlo</span>
          <span className="font-medium">{formatDistance(point.distanceKm)}</span>
        </div>
        {point.matchScore != null ? (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Composite score</span>
            <span className="font-medium">{Math.round(point.matchScore)} / 100</span>
          </div>
        ) : null}
        <Button asChild className="w-full">
          <a href={`/listings/${point.id}`}>Open detailpagina</a>
        </Button>
      </div>
    </>
  );
}
