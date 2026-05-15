import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Sparkles } from "lucide-react";
import { KpiCard } from "./kpi-card";
import { KpiGrid } from "./kpi-grid";
import type { DashboardKpis } from "@/server/services/dashboard";

describe("KpiCard", () => {
  it("renders label, value and optional hint", () => {
    render(
      <KpiCard
        label="Nieuwe matches vandaag"
        value="12"
        hint="Toegevoegd sinds middernacht"
        icon={Sparkles}
        tone="special"
      />,
    );
    expect(screen.getByText("Nieuwe matches vandaag")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Toegevoegd sinds middernacht")).toBeInTheDocument();
  });

  it("renders without a hint when omitted", () => {
    render(<KpiCard label="Total" value="42" icon={Sparkles} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});

describe("KpiGrid", () => {
  const kpis: DashboardKpis = {
    newToday: 5,
    activeMatches: 137,
    specialObjects: 23,
    averagePriceEur: 167_500,
    averageDistanceKm: 184,
    activeSources: 4,
  };

  it("renders the six required dashboard KPIs from the brief", () => {
    render(<KpiGrid kpis={kpis} />);
    expect(screen.getByText("Nieuwe matches vandaag")).toBeInTheDocument();
    expect(screen.getByText("Totaal actieve matches")).toBeInTheDocument();
    expect(screen.getByText("Bijzondere objecten")).toBeInTheDocument();
    expect(screen.getByText("Gemiddelde prijs")).toBeInTheDocument();
    expect(screen.getByText("Gemiddelde afstand")).toBeInTheDocument();
    expect(screen.getByText("Bronnen actief")).toBeInTheDocument();
  });

  it("handles null averages gracefully", () => {
    render(
      <KpiGrid
        kpis={{ ...kpis, averagePriceEur: null, averageDistanceKm: null }}
      />,
    );
    // Both average tiles should fall back to em-dash from format helpers
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });
});
