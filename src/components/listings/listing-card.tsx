import Image from "next/image";
import Link from "next/link";
import {
  ExternalLink,
  MapPin,
  Sparkles,
  TreePine,
  Zap,
  Droplet,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  COUNTRY_LABELS,
  PROPERTY_TYPE_LABELS,
  RENOVATION_STATUS_LABELS,
  SPECIAL_OBJECT_LABELS,
  UTILITY_LABELS,
  formatDistance,
  formatLandArea,
  formatPrice,
  label,
} from "@/lib/format";
import { SaveIgnoreButtons } from "./save-ignore-buttons";

export type ListingCardData = {
  id: string;
  titleNl: string | null;
  titleOriginal: string;
  originalUrl: string;
  priceEur: number | null;
  country: string;
  region: string | null;
  city: string | null;
  propertyType: string;
  renovationStatus: string;
  isSpecialObject: boolean;
  specialObjectType: string | null;
  electricityStatus: string;
  waterStatus: string;
  landAreaM2: number | null;
  location: { distanceFromVenloKm: number | null } | null;
  score: { matchScore: number; compositeScore: number } | null;
  media: Array<{ id: string; url: string; caption: string | null }>;
};

export function ListingCard({
  listing,
  compact = false,
}: {
  listing: ListingCardData;
  compact?: boolean;
}) {
  const title = listing.titleNl ?? listing.titleOriginal;
  const photo = listing.media[0];
  const score = listing.score?.matchScore ?? 0;

  return (
    <Card className="group flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
      {/* Photo + match score badge */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {photo ? (
          <Image
            src={photo.url}
            alt={photo.caption ?? title}
            fill
            sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            Geen foto beschikbaar
          </div>
        )}
        {listing.isSpecialObject ? (
          <Badge variant="special" className="absolute left-3 top-3 shadow">
            <Sparkles className="h-3 w-3" />
            {label(SPECIAL_OBJECT_LABELS, listing.specialObjectType ?? "other")}
          </Badge>
        ) : null}
        <div
          className={cn(
            "absolute right-3 top-3 rounded-full px-2.5 py-1 text-xs font-semibold shadow",
            score >= 80
              ? "bg-[hsl(var(--success))] text-white"
              : score >= 60
                ? "bg-[hsl(var(--warning))] text-black"
                : "bg-muted text-muted-foreground",
          )}
          aria-label={`Match score ${Math.round(score)} van 100`}
        >
          {Math.round(score)}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div>
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">
            <Link href={`/listings/${listing.id}`} className="hover:underline">
              {title}
            </Link>
          </h3>
          <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" />
            <span>
              {[listing.city, listing.region, label(COUNTRY_LABELS, listing.country)]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </p>
        </div>

        <div className="flex items-baseline justify-between gap-2">
          <span className="text-xl font-semibold tracking-tight">
            {formatPrice(listing.priceEur)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatDistance(listing.location?.distanceFromVenloKm ?? null)} v.a. Venlo
          </span>
        </div>

        {!compact ? (
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="secondary">
              <TreePine className="h-3 w-3" />
              {formatLandArea(listing.landAreaM2)}
            </Badge>
            <Badge variant="outline">{label(PROPERTY_TYPE_LABELS, listing.propertyType)}</Badge>
            <Badge variant="outline">
              {label(RENOVATION_STATUS_LABELS, listing.renovationStatus)}
            </Badge>
          </div>
        ) : null}

        {!compact ? (
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3 w-3" /> {label(UTILITY_LABELS, listing.electricityStatus)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Droplet className="h-3 w-3" /> {label(UTILITY_LABELS, listing.waterStatus)}
            </span>
          </div>
        ) : null}

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <Button asChild variant="ghost" size="sm">
            <a
              href={listing.originalUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Bekijk origineel"
            >
              <ExternalLink className="h-4 w-4" />
              Bekijk origineel
            </a>
          </Button>
          <SaveIgnoreButtons listingId={listing.id} />
        </div>
      </div>
    </Card>
  );
}
