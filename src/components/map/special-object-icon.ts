/**
 * Build a Leaflet DivIcon per special-object type. Using inline SVG keeps
 * us off third-party asset CDNs and avoids the classic Leaflet 'broken
 * marker' problem with bundlers.
 *
 * Returned icons are cached so equal-type pins share one DivIcon instance.
 */
import L from "leaflet";

type IconKey =
  | "mill"
  | "watermill"
  | "station_building"
  | "lock_keeper_house"
  | "lighthouse"
  | "farmhouse"
  | "default";

const COLORS: Record<IconKey, string> = {
  mill: "#a855f7",            // purple
  watermill: "#0ea5e9",        // sky
  station_building: "#f97316", // orange
  lock_keeper_house: "#14b8a6",// teal
  lighthouse: "#facc15",       // amber
  farmhouse: "#65a30d",        // lime
  default: "#22c55e",          // green
};

// Simple shapes per type. The SVG renders inside a colored circle.
const SHAPES: Record<IconKey, string> = {
  mill: '<path d="M12 2v20M2 12h20M5 5l14 14M19 5L5 19" stroke-width="2"/>',
  watermill:
    '<circle cx="12" cy="12" r="6" fill="none" stroke-width="2"/><path d="M12 2v8M12 14v8M2 12h8M14 12h8" stroke-width="2"/>',
  station_building:
    '<rect x="4" y="9" width="16" height="9" rx="1" fill="none" stroke-width="2"/><path d="M4 9l8-6 8 6" stroke-width="2"/>',
  lock_keeper_house:
    '<path d="M3 12h18M3 8h18M3 16h18" stroke-width="2"/>',
  lighthouse:
    '<path d="M12 2v6M9 8h6l-1 12h-4z" stroke-width="2"/><path d="M5 8l14 0" stroke-width="2"/>',
  farmhouse:
    '<path d="M3 11l9-7 9 7M5 11v9h14v-9" stroke-width="2"/>',
  default: '<circle cx="12" cy="12" r="4" fill="currentColor"/>',
};

function svgFor(key: IconKey): string {
  const color = COLORS[key];
  const shape = SHAPES[key];
  return `
    <span class="rr-pin" style="--pin-color:${color}">
      <span class="rr-pin-circle">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="white" stroke-linecap="round" stroke-linejoin="round">${shape}</svg>
      </span>
    </span>
  `;
}

const cache = new Map<IconKey, L.DivIcon>();

export function iconFor(specialType: string | null | undefined, propertyType: string): L.DivIcon {
  const key = resolveKey(specialType, propertyType);
  const cached = cache.get(key);
  if (cached) return cached;
  const icon = L.divIcon({
    className: "rr-pin-wrapper",
    html: svgFor(key),
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
  cache.set(key, icon);
  return icon;
}

function resolveKey(special: string | null | undefined, propertyType: string): IconKey {
  if (special === "mill") return "mill";
  if (special === "watermill") return "watermill";
  if (special === "station_building") return "station_building";
  if (special === "lock_keeper_house") return "lock_keeper_house";
  if (special === "lighthouse") return "lighthouse";
  if (propertyType === "farmhouse" || propertyType === "longere") return "farmhouse";
  return "default";
}
