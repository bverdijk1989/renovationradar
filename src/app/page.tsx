import { PageHeader } from "@/components/layout/page-header";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { TopMatches } from "@/components/dashboard/top-matches";
import { MapPreview } from "@/components/dashboard/map-preview";
import { RecentPriceDrops } from "@/components/dashboard/recent-price-drops";
import {
  getDashboardKpis,
  getMapPoints,
  getRecentPriceDrops,
  getTopMatches,
} from "@/server/services/dashboard";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [kpis, topMatches, mapPoints, priceDrops] = await Promise.all([
    getDashboardKpis(),
    getTopMatches(10),
    getMapPoints(200),
    getRecentPriceDrops(5),
  ]);

  return (
    <div className="space-y-10">
      <PageHeader
        title="Dashboard"
        description="Overzicht van nieuwe matches, kaart en prijsdalingen."
      />

      <KpiGrid kpis={kpis} />

      <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
        <MapPreview points={mapPoints} />
        <RecentPriceDrops items={priceDrops} />
      </section>

      <section>
        <div className="mb-4 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">Top 10 beste matches</h2>
          <p className="text-xs text-muted-foreground">Gesorteerd op composite score</p>
        </div>
        <TopMatches matches={topMatches} />
      </section>
    </div>
  );
}
