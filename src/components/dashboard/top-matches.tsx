import { ListingCard, type ListingCardData } from "@/components/listings/listing-card";
import { EmptyState } from "@/components/states/empty-state";
import type { DashboardMatch } from "@/server/services/dashboard";

export function TopMatches({ matches }: { matches: DashboardMatch[] }) {
  if (matches.length === 0) {
    return (
      <EmptyState
        title="Nog geen matches"
        description="Activeer een bron en draai een crawl-job om listings te zien."
      />
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
      {matches.map((m) => (
        <ListingCard key={m.id} listing={toCard(m)} />
      ))}
    </div>
  );
}

export function toCard(m: DashboardMatch): ListingCardData {
  return {
    id: m.id,
    titleNl: m.titleNl,
    titleOriginal: m.titleOriginal,
    originalUrl: m.originalUrl,
    priceEur: m.priceEur,
    country: m.country,
    region: m.region,
    city: m.city,
    propertyType: m.propertyType,
    renovationStatus: m.renovationStatus,
    isSpecialObject: m.isSpecialObject,
    specialObjectType: m.specialObjectType,
    electricityStatus: m.electricityStatus,
    waterStatus: m.waterStatus,
    landAreaM2: m.landAreaM2,
    location: m.location
      ? { distanceFromVenloKm: m.location.distanceFromVenloKm }
      : null,
    score: m.score
      ? { matchScore: m.score.matchScore, compositeScore: m.score.compositeScore }
      : null,
    media: m.media,
  };
}
