"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Criteria = {
  maxPriceEur: number;
  minLandM2: number;
  requireDetached: boolean;
  requireElectricity: boolean;
  preferWater: boolean;
  includeSpecialObjects: boolean;
  maxDistanceKm: number;
  countries: string[];
  notes: string | null;
  updatedAt: string;
};

const COUNTRY_LABELS: Record<string, string> = {
  FR: "Frankrijk",
  BE: "België",
  DE: "Duitsland",
  NL: "Nederland",
};

export function CriteriaForm({ initial }: { initial: Criteria }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [maxPriceEur, setMaxPriceEur] = useState(String(initial.maxPriceEur));
  const [minLandM2, setMinLandM2] = useState(String(initial.minLandM2));
  const [requireDetached, setRequireDetached] = useState(initial.requireDetached);
  const [requireElectricity, setRequireElectricity] = useState(
    initial.requireElectricity,
  );
  const [preferWater, setPreferWater] = useState(initial.preferWater);
  const [includeSpecialObjects, setIncludeSpecialObjects] = useState(
    initial.includeSpecialObjects,
  );
  const [maxDistanceKm, setMaxDistanceKm] = useState(
    String(initial.maxDistanceKm),
  );
  const [countries, setCountries] = useState<string[]>(initial.countries);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  function toggleCountry(c: string) {
    setCountries((current) =>
      current.includes(c) ? current.filter((x) => x !== c) : [...current, c],
    );
  }

  async function save() {
    setError(null);
    setBusy(true);
    try {
      const body = {
        maxPriceEur: Number.parseInt(maxPriceEur, 10),
        minLandM2: Number.parseInt(minLandM2, 10),
        requireDetached,
        requireElectricity,
        preferWater,
        includeSpecialObjects,
        maxDistanceKm: Number.parseFloat(maxDistanceKm),
        countries,
        notes: notes.trim() ? notes.trim() : null,
      };
      const res = await fetch("/api/criteria", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(
          json?.error?.message ?? `Opslaan mislukt (HTTP ${res.status})`,
        );
      }
      setSavedAt(new Date());
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="maxPriceEur">Maximumprijs (€)</Label>
          <Input
            id="maxPriceEur"
            type="number"
            min={1}
            value={maxPriceEur}
            onChange={(e) => setMaxPriceEur(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Listings duurder dan dit bedrag worden uit "matches" gefilterd.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="minLandM2">Minimum grond (m²)</Label>
          <Input
            id="minLandM2"
            type="number"
            min={0}
            value={minLandM2}
            onChange={(e) => setMinLandM2(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            10.000 m² = 1 hectare. Onder deze waarde geen match.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="maxDistanceKm">Maximumafstand vanaf Venlo (km)</Label>
          <Input
            id="maxDistanceKm"
            type="number"
            min={1}
            max={2000}
            value={maxDistanceKm}
            onChange={(e) => setMaxDistanceKm(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label>Landen</Label>
          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(COUNTRY_LABELS).map(([code, label]) => (
              <label
                key={code}
                className="flex cursor-pointer items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm"
              >
                <input
                  type="checkbox"
                  checked={countries.includes(code)}
                  onChange={() => toggleCountry(code)}
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-3 rounded-md border bg-muted/30 p-4">
        <p className="text-sm font-medium">Pand-eisen</p>
        <Toggle
          checked={requireDetached}
          onChange={setRequireDetached}
          label="Vrijstaand vereist"
          hint="Zonder vrijstaand-classificatie wordt het pand niet als match getoond (tenzij special object)."
        />
        <Toggle
          checked={requireElectricity}
          onChange={setRequireElectricity}
          label="Stroom vereist"
          hint="Listings zonder stroom-aansluiting worden uitgefilterd."
        />
        <Toggle
          checked={preferWater}
          onChange={setPreferWater}
          label="Water gewenst (preferred, niet hard)"
          hint="Tellen mee in scoring, maar listings zonder water worden niet weggefilterd."
        />
        <Toggle
          checked={includeSpecialObjects}
          onChange={setIncludeSpecialObjects}
          label="Special objects altijd tonen"
          hint="Molens, sluiswachterhuizen, stations en vuurtorens verschijnen als match óók als ze niet aan de prijs/grond/vrijstaand-eisen voldoen."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="notes">Notities (optioneel)</Label>
        <textarea
          id="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          placeholder="Bv. 'tijdelijk landeis verlaagd om meer aanbod te zien'"
        />
        <p className="text-xs text-muted-foreground">
          Laatst gewijzigd: {new Date(initial.updatedAt).toLocaleString("nl-NL")}
        </p>
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          {error}
        </p>
      ) : null}

      {savedAt ? (
        <p className="flex items-center gap-1.5 text-sm text-emerald-600">
          <Check className="h-4 w-4" />
          Opgeslagen om {savedAt.toLocaleTimeString()}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button onClick={save} disabled={busy || countries.length === 0}>
          <Save className="mr-1 h-4 w-4" />
          {busy ? "Opslaan…" : "Opslaan"}
        </Button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4"
      />
      <span>
        <strong>{label}</strong>
        {hint ? (
          <p className="text-xs text-muted-foreground">{hint}</p>
        ) : null}
      </span>
    </label>
  );
}
