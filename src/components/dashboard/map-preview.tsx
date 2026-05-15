import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ListingMap, type MapPoint } from "@/components/map/listing-map";
import type { DashboardMapPoint } from "@/server/services/dashboard";
import { ArrowRight } from "lucide-react";

export function MapPreview({ points }: { points: DashboardMapPoint[] }) {
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
    <Card className="flex flex-col">
      <CardHeader className="flex-row items-start justify-between">
        <CardTitle>Kaartweergave</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link href="/map">
            Open volledig
            <ArrowRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="flex-1 pt-0">
        <div className="aspect-[16/9] w-full overflow-hidden rounded-lg border">
          <ListingMap points={mapPoints} className="h-full w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
