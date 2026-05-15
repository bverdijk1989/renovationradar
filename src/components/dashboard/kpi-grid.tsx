import {
  Sparkles,
  CalendarDays,
  ListChecks,
  Coins,
  Route,
  Database,
} from "lucide-react";
import { KpiCard } from "./kpi-card";
import { formatCompactNumber, formatDistance, formatPrice } from "@/lib/format";
import type { DashboardKpis } from "@/server/services/dashboard";

export function KpiGrid({ kpis }: { kpis: DashboardKpis }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard
        label="Nieuwe matches vandaag"
        value={formatCompactNumber(kpis.newToday)}
        icon={CalendarDays}
        tone="primary"
        hint="Toegevoegd sinds middernacht"
      />
      <KpiCard
        label="Totaal actieve matches"
        value={formatCompactNumber(kpis.activeMatches)}
        icon={ListChecks}
        hint="Voldoen aan harde criteria"
      />
      <KpiCard
        label="Bijzondere objecten"
        value={formatCompactNumber(kpis.specialObjects)}
        icon={Sparkles}
        tone="special"
        hint="Molens, stations, sluiswachters..."
      />
      <KpiCard
        label="Gemiddelde prijs"
        value={formatPrice(
          kpis.averagePriceEur != null ? Math.round(kpis.averagePriceEur) : null,
        )}
        icon={Coins}
        hint="Over actieve matches"
      />
      <KpiCard
        label="Gemiddelde afstand"
        value={formatDistance(
          kpis.averageDistanceKm != null ? Math.round(kpis.averageDistanceKm) : null,
        )}
        icon={Route}
        hint="Vanaf Venlo"
      />
      <KpiCard
        label="Bronnen actief"
        value={formatCompactNumber(kpis.activeSources)}
        icon={Database}
        tone="success"
        hint="Status = active"
      />
    </div>
  );
}
