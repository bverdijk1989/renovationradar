"use client";
import { useState } from "react";
import { Bell, Plus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import {
  type AlertItem,
  createAlert,
  patchAlert,
  useAlerts,
} from "@/hooks/use-alerts";

export function AlertsManager() {
  const { data, error, isLoading } = useAlerts();
  const alerts = data?.data ?? [];

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      <div className="space-y-3">
        {isLoading ? (
          <Card className="p-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
            Alerts laden…
          </Card>
        ) : error ? (
          <ErrorState description="Kon alerts niet laden." />
        ) : alerts.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nog geen alerts"
            description="Maak je eerste alert aan via het formulier rechts."
          />
        ) : (
          alerts.map((a) => <AlertRow key={a.id} alert={a} />)
        )}
      </div>
      <CreateAlertForm />
    </div>
  );
}

function AlertRow({ alert }: { alert: AlertItem }) {
  const [enabled, setEnabled] = useState(alert.enabled);
  const [pending, setPending] = useState(false);

  async function toggle(next: boolean) {
    setPending(true);
    setEnabled(next);
    try {
      await patchAlert(alert.id, { enabled: next });
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-medium">{alert.name}</h3>
            <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
              <Badge variant="secondary">{alert.channel}</Badge>
              <Badge variant="outline">{alert.frequency}</Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Aan</Label>
            <Switch checked={enabled} onCheckedChange={toggle} disabled={pending} />
          </div>
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">
            Criteria bekijken
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-muted p-2 font-mono">
            {JSON.stringify(alert.criteria, null, 2)}
          </pre>
        </details>
      </CardContent>
    </Card>
  );
}

function CreateAlertForm() {
  const [name, setName] = useState("");
  const [frequency, setFrequency] = useState<AlertItem["frequency"]>("daily");
  const [channel, setChannel] = useState<AlertItem["channel"]>("email");
  const [specialOnly, setSpecialOnly] = useState(false);
  const [maxPrice, setMaxPrice] = useState("200000");
  const [minLand, setMinLand] = useState("10000");
  const [maxDistance, setMaxDistance] = useState("350");
  const [country, setCountry] = useState<string>("all");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createAlert({
        name,
        channel,
        frequency,
        criteria: {
          ...(country !== "all" ? { country: [country] } : {}),
          ...(specialOnly ? { isSpecialObject: true } : {}),
          maxPriceEur: Number(maxPrice),
          minLandM2: Number(minLand),
          maxDistanceKm: Number(maxDistance),
        },
      });
      setName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mislukt");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nieuwe alert</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="alert-name">Naam</Label>
            <Input
              id="alert-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              placeholder="Watermolens FR/BE binnen 250 km"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="alert-frequency">Frequentie</Label>
              <Select
                value={frequency}
                onValueChange={(v) => setFrequency(v as AlertItem["frequency"])}
              >
                <SelectTrigger id="alert-frequency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="instant">Direct</SelectItem>
                  <SelectItem value="daily">Dagelijks</SelectItem>
                  <SelectItem value="weekly">Wekelijks</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-channel">Kanaal</Label>
              <Select
                value={channel}
                onValueChange={(v) => setChannel(v as AlertItem["channel"])}
              >
                <SelectTrigger id="alert-channel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">E-mail</SelectItem>
                  <SelectItem value="web_push">Web push</SelectItem>
                  <SelectItem value="in_app">In-app</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alert-country">Land</Label>
            <Select value={country} onValueChange={setCountry}>
              <SelectTrigger id="alert-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle landen</SelectItem>
                <SelectItem value="FR">Frankrijk</SelectItem>
                <SelectItem value="BE">België</SelectItem>
                <SelectItem value="DE">Duitsland</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="alert-max-price">Max. prijs (€)</Label>
              <Input
                id="alert-max-price"
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="alert-min-land">Min. grond (m²)</Label>
              <Input
                id="alert-min-land"
                type="number"
                value={minLand}
                onChange={(e) => setMinLand(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="alert-distance">Max. afstand (km)</Label>
            <Input
              id="alert-distance"
              type="number"
              value={maxDistance}
              onChange={(e) => setMaxDistance(e.target.value)}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2">
            <Label htmlFor="alert-special" className="cursor-pointer">
              Alleen bijzondere objecten
            </Label>
            <Switch
              id="alert-special"
              checked={specialOnly}
              onCheckedChange={setSpecialOnly}
            />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <Button type="submit" disabled={submitting || !name} className="w-full">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Alert toevoegen
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
