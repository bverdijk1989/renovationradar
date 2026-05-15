"use client";
import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { LatLngBoundsExpression } from "leaflet";
import { VENLO } from "@/lib/geo";

/**
 * Leaflet has to load client-side only (depends on `window`). We dynamic-import
 * react-leaflet's pieces with `ssr: false`, then build the map inside this
 * client component.
 *
 * The map auto-fits its bounds around the provided points + Venlo so the
 * dashboard preview always shows the full search area.
 */

export type MapPoint = {
  id: string;
  lat: number;
  lng: number;
  title: string;
  priceEur: number | null;
  distanceKm: number | null;
  matchScore: number | null;
  specialObjectType: string | null;
  propertyType: string;
};

const MapInner = dynamic(() => import("./listing-map-inner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
      Kaart wordt geladen…
    </div>
  ),
});

export function ListingMap({
  points,
  onSelect,
  selectedId,
  className,
}: {
  points: MapPoint[];
  onSelect?: (id: string | null) => void;
  selectedId?: string | null;
  className?: string;
}) {
  const bounds = useMemo<LatLngBoundsExpression>(() => {
    const lats = [VENLO.lat, ...points.map((p) => p.lat)];
    const lngs = [VENLO.lng, ...points.map((p) => p.lng)];
    const south = Math.min(...lats);
    const north = Math.max(...lats);
    const west = Math.min(...lngs);
    const east = Math.max(...lngs);
    // Pad slightly so pins aren't flush against the edge.
    const padLat = (north - south) * 0.05 || 0.5;
    const padLng = (east - west) * 0.05 || 0.5;
    return [
      [south - padLat, west - padLng],
      [north + padLat, east + padLng],
    ];
  }, [points]);

  // Re-render trigger so Leaflet recomputes its size on container changes.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground ${className ?? ""}`}
      >
        Kaart wordt geladen…
      </div>
    );
  }

  return (
    <div className={className}>
      <MapInner
        points={points}
        bounds={bounds}
        onSelect={onSelect}
        selectedId={selectedId ?? null}
      />
    </div>
  );
}
