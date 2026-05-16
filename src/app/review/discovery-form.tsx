"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiClient, ApiError } from "@/lib/api-client";

type RunResult = {
  queriesGenerated: number;
  candidatesFetched: number;
  candidatesPersisted: number;
  candidatesSkipped: number;
  reasons: { skipped_existing: number; robots_blocked: number; fetch_failed: number };
};

export function DiscoveryForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const [country, setCountry] = useState<"FR" | "BE" | "DE">("FR");
  const [language, setLanguage] = useState<"fr" | "nl" | "de" | "en">("fr");
  const [region, setRegion] = useState("");
  const [urls, setUrls] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setSubmitting(true);
    try {
      const res = await apiClient.post<RunResult>("/api/discovery/run", {
        country,
        language,
        region: region || undefined,
        provider: "manual_import",
        providerInput: { urls },
      });
      setResult(res);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(
        e instanceof ApiError
          ? `${e.code}: ${e.message}`
          : (e as Error).message,
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Search className="h-4 w-4" />
          Discovery — nieuwe makelaars vinden
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="disc-country">Land</Label>
            <Select value={country} onValueChange={(v) => setCountry(v as typeof country)}>
              <SelectTrigger id="disc-country"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FR">Frankrijk</SelectItem>
                <SelectItem value="BE">België</SelectItem>
                <SelectItem value="DE">Duitsland</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="disc-language">Taal</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
              <SelectTrigger id="disc-language"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Frans</SelectItem>
                <SelectItem value="nl">Nederlands</SelectItem>
                <SelectItem value="de">Duits</SelectItem>
                <SelectItem value="en">Engels</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="disc-region">Regio (optioneel)</Label>
            <Input
              id="disc-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Lorraine, Wallonie, Eifel, ..."
            />
          </div>

          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="disc-urls">
              URLs om te onderzoeken (één per regel)
            </Label>
            <textarea
              id="disc-urls"
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              required
              rows={4}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              placeholder="https://example-makelaar.fr/&#10;https://immobilier-rural.fr/"
            />
            <p className="text-xs text-muted-foreground">
              De engine respecteert robots.txt. Classificeert + extraheert
              naam, e-mail, telefoon. Schrijft alles als <em>pending review</em> —
              activatie blijft handmatig.
            </p>
          </div>

          {error ? (
            <p className="text-sm text-destructive md:col-span-2">{error}</p>
          ) : null}

          {result ? (
            <div className="rounded-md border bg-muted/40 p-3 text-sm md:col-span-2">
              <p className="font-medium">Discovery resultaat</p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                <li>Queries gegenereerd: {result.queriesGenerated}</li>
                <li>Kandidaten opgehaald: {result.candidatesFetched}</li>
                <li>Toegevoegd aan review: <strong>{result.candidatesPersisted}</strong></li>
                <li>
                  Overgeslagen: {result.candidatesSkipped} ·
                  bestond al: {result.reasons.skipped_existing} ·
                  robots blocked: {result.reasons.robots_blocked} ·
                  fetch failed: {result.reasons.fetch_failed}
                </li>
              </ul>
            </div>
          ) : null}

          <div className="md:col-span-2">
            <Button type="submit" disabled={submitting || pending || !urls.trim()}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Start discovery
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
