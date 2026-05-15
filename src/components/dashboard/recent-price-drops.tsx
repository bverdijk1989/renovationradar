import Link from "next/link";
import { TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/states/empty-state";
import {
  COUNTRY_LABELS,
  formatDistance,
  formatPrice,
  formatRelative,
  label,
} from "@/lib/format";
import type { DashboardMatch } from "@/server/services/dashboard";

export type PriceDrop = {
  listing: DashboardMatch;
  dropEur: number;
  detectedAt: Date;
};

export function RecentPriceDrops({ items }: { items: PriceDrop[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingDown className="h-4 w-4 text-[hsl(var(--success))]" />
          Recente prijsdalingen
        </CardTitle>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            title="Nog geen prijsdalingen"
            description="De normalisatie-pipeline produceert prijsdaling-features vanaf fase 4."
          />
        ) : (
          <ul className="divide-y">
            {items.map(({ listing, dropEur, detectedAt }) => {
              const title = listing.titleNl ?? listing.titleOriginal;
              return (
                <li key={listing.id} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/listings/${listing.id}`} className="block hover:underline">
                      <p className="line-clamp-1 text-sm font-medium">{title}</p>
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        label(COUNTRY_LABELS, listing.country),
                        listing.city,
                        formatDistance(listing.location?.distanceFromVenloKm ?? null),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                      {" · "}
                      {formatRelative(detectedAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">
                      {formatPrice(listing.priceEur)}
                    </p>
                    {dropEur < 0 ? (
                      <p className="text-xs font-medium text-[hsl(var(--success))]">
                        {formatPrice(dropEur)}
                      </p>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
