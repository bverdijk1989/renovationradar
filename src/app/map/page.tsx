import { PageHeader } from "@/components/layout/page-header";
import { MapView } from "./map-view";
import { getMapPoints } from "@/server/services/dashboard";
import type { MapPoint } from "@/components/map/listing-map";

export const dynamic = "force-dynamic";

export default async function MapPage() {
  const points = await getMapPoints(1_000);
  const mapPoints: MapPoint[] = points
    .filter((p) => p.location?.lat != null && p.location?.lng != null)
    .map((p) => ({
      id: p.id,
      lat: p.location!.lat!,
      lng: p.location!.lng!,
      title: p.titleNl ?? p.titleOriginal,
      priceEur: p.priceEur,
      distanceKm: p.location?.distanceFromVenloKm ?? null,
      matchScore: p.score?.compositeScore ?? null,
      specialObjectType: p.specialObjectType,
      propertyType: p.propertyType,
    }));

  return (
    <div className="flex h-[calc(100vh-6rem)] flex-col gap-4">
      <PageHeader
        title="Kaartweergave"
        description={`${mapPoints.length} match${mapPoints.length === 1 ? "" : "es"} met locatie binnen 350 km van Venlo`}
        className="mb-0"
      />
      <div className="min-h-0 flex-1">
        <MapView initialPoints={mapPoints} />
      </div>
    </div>
  );
}
