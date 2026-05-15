"use client";
import { MapContainer, TileLayer, Marker, Popup, Circle } from "react-leaflet";
import type { LatLngBoundsExpression } from "leaflet";
import "leaflet/dist/leaflet.css";
import { iconFor } from "./special-object-icon";
import { VENLO } from "@/lib/geo";
import { formatDistance, formatPrice } from "@/lib/format";
import type { MapPoint } from "./listing-map";

/**
 * Pure client component — Leaflet touches `window`, so it must not be SSR'd.
 * Loaded via the dynamic() wrapper in listing-map.tsx.
 */
export default function ListingMapInner({
  points,
  bounds,
  selectedId,
  onSelect,
}: {
  points: MapPoint[];
  bounds: LatLngBoundsExpression;
  selectedId: string | null;
  onSelect?: (id: string | null) => void;
}) {
  return (
    <MapContainer
      bounds={bounds}
      scrollWheelZoom
      className="h-full w-full rounded-lg"
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {/* 350 km radius circle from Venlo */}
      <Circle
        center={[VENLO.lat, VENLO.lng]}
        radius={350_000}
        pathOptions={{
          color: "hsl(152 47% 28%)",
          weight: 1,
          dashArray: "4 4",
          fillOpacity: 0.04,
        }}
      />
      {/* Venlo origin marker */}
      <Marker position={[VENLO.lat, VENLO.lng]} icon={iconFor(null, "origin")}>
        <Popup>
          <strong>Venlo</strong>
          <br />
          Zoekcentrum · 350 km radius
        </Popup>
      </Marker>

      {points.map((p) => (
        <Marker
          key={p.id}
          position={[p.lat, p.lng]}
          icon={iconFor(p.specialObjectType, p.propertyType)}
          eventHandlers={{
            click: () => onSelect?.(p.id),
          }}
          opacity={selectedId == null || selectedId === p.id ? 1 : 0.45}
        >
          <Popup>
            <div className="space-y-1">
              <strong>{p.title}</strong>
              <div>{formatPrice(p.priceEur)}</div>
              <div>{formatDistance(p.distanceKm)} v.a. Venlo</div>
              {p.matchScore != null ? <div>Score: {Math.round(p.matchScore)}</div> : null}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
