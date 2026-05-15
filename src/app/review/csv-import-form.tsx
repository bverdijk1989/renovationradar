"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileUp,
  Loader2,
  Eye,
  Play,
  AlertCircle,
  Check,
} from "lucide-react";
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

type ParseSummary = {
  rowCount: number;
  errors: Array<{ line: number; message: string }>;
  delimiter: string;
  hadHeader: boolean;
};

type GroupPreview = {
  country: string;
  language: string;
  region: string | null;
  urls: string[];
};

type GroupResult = {
  country: string;
  language: string;
  region: string | null;
  urls: number;
  result: {
    candidatesFetched: number;
    candidatesPersisted: number;
    candidatesSkipped: number;
    reasons: { skipped_existing: number; robots_blocked: number; fetch_failed: number };
  };
};

type ImportResponse = {
  parsed: ParseSummary;
  dryRun: boolean;
  groups?: GroupPreview[];
  totals?: { candidatesFetched: number; candidatesPersisted: number; candidatesSkipped: number };
} & { groups?: GroupResult[] };

/**
 * Bulk-import van URLs via CSV. Twee stappen:
 *   1. "Voorbeeld" → POST met dryRun=true, toont parsed + groepering.
 *   2. "Importeren" → POST met dryRun=false, draait Discovery Engine.
 *
 * De Discovery Engine doet de robots.txt-check + classify + persist als
 * pending_review (zoals de bestaande discovery-form). Niets wordt
 * automatisch geactiveerd.
 */
export function CsvImportForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [, startTransition] = useTransition();

  const [country, setCountry] = useState<"FR" | "BE" | "DE" | "NL">("FR");
  const [language, setLanguage] = useState<"fr" | "nl" | "de" | "en">("fr");
  const [region, setRegion] = useState("");

  const [busy, setBusy] = useState<"preview" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResponse | null>(null);
  const [importResult, setImportResult] = useState<ImportResponse | null>(null);

  async function send(dryRun: boolean) {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Kies eerst een CSV-bestand.");
      return;
    }
    setError(null);
    setBusy(dryRun ? "preview" : "import");
    if (!dryRun) setImportResult(null);

    const fd = new FormData();
    fd.append("file", file);
    fd.append("defaultCountry", country);
    fd.append("defaultLanguage", language);
    if (region) fd.append("defaultRegion", region);
    fd.append("dryRun", dryRun ? "true" : "false");

    try {
      const res = await fetch("/api/discovery/import-csv", {
        method: "POST",
        body: fd,
        credentials: "same-origin",
      });
      const body = await res.json();
      if (!res.ok) {
        setError(
          body?.error?.message ?? `Upload mislukt (HTTP ${res.status})`,
        );
        return;
      }
      if (dryRun) setPreview(body);
      else {
        setImportResult(body);
        setPreview(null);
        startTransition(() => router.refresh());
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileUp className="h-4 w-4" />
          CSV-import — bulk URLs uploaden
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Upload een CSV met minimaal een <code>url</code>-kolom. Optionele
          kolommen: <code>country</code>, <code>language</code>,{" "}
          <code>region</code>, <code>note</code>. Komma OF puntkomma als
          delimiter. Max <strong>50 URLs per upload</strong>. Klik eerst{" "}
          <em>Voorbeeld</em> om te zien wat er geïmporteerd wordt.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="csv-file">CSV-bestand</Label>
          <Input
            id="csv-file"
            type="file"
            accept=".csv,text/csv"
            ref={fileRef}
            className="cursor-pointer"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="csv-country">Standaard land</Label>
            <Select
              value={country}
              onValueChange={(v) => setCountry(v as typeof country)}
            >
              <SelectTrigger id="csv-country">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="FR">Frankrijk</SelectItem>
                <SelectItem value="BE">België</SelectItem>
                <SelectItem value="DE">Duitsland</SelectItem>
                <SelectItem value="NL">Nederland</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csv-language">Standaard taal</Label>
            <Select
              value={language}
              onValueChange={(v) => setLanguage(v as typeof language)}
            >
              <SelectTrigger id="csv-language">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fr">Frans</SelectItem>
                <SelectItem value="nl">Nederlands</SelectItem>
                <SelectItem value="de">Duits</SelectItem>
                <SelectItem value="en">Engels</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="csv-region">Standaard regio (optioneel)</Label>
            <Input
              id="csv-region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="Lorraine, Eifel, Wallonie…"
            />
          </div>
        </div>

        {error ? (
          <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => send(true)}
            disabled={busy !== null}
          >
            {busy === "preview" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
            Voorbeeld
          </Button>
          <Button
            type="button"
            onClick={() => send(false)}
            disabled={busy !== null || !preview}
            title={!preview ? "Klik eerst 'Voorbeeld'" : undefined}
          >
            {busy === "import" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Importeren
          </Button>
        </div>

        {/* ----- Preview ----- */}
        {preview ? <ParsedSummary data={preview} /> : null}

        {/* ----- Real-run result ----- */}
        {importResult ? <ImportSummary data={importResult} /> : null}
      </CardContent>
    </Card>
  );
}

function ParsedSummary({ data }: { data: ImportResponse }) {
  const { parsed, groups } = data;
  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3 text-sm">
      <p className="font-medium">
        Voorbeeld ({parsed.rowCount} URLs, {parsed.errors.length} parse-fouten,
        delimiter <code>{parsed.delimiter === ";" ? ";" : ","}</code>,
        {parsed.hadHeader ? " header" : " zonder header"})
      </p>
      {parsed.errors.length > 0 ? (
        <details>
          <summary className="cursor-pointer text-destructive">
            {parsed.errors.length} regel(s) overgeslagen
          </summary>
          <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs">
            {parsed.errors.slice(0, 20).map((e, i) => (
              <li key={i}>
                regel {e.line}: {e.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {groups && groups.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Groepen (per land × taal × regio)
          </p>
          {(groups as GroupPreview[]).map((g, i) => (
            <div key={i} className="rounded bg-background p-2 text-xs">
              <span className="font-medium">
                {g.country} · {g.language}
                {g.region ? ` · ${g.region}` : ""}
              </span>{" "}
              — {g.urls.length} URL(s)
              <details className="mt-1">
                <summary className="cursor-pointer text-muted-foreground">
                  Toon URLs
                </summary>
                <ul className="mt-1 list-disc pl-5 font-mono">
                  {g.urls.slice(0, 10).map((u, j) => (
                    <li key={j}>{u}</li>
                  ))}
                  {g.urls.length > 10 ? (
                    <li className="text-muted-foreground">
                      … en nog {g.urls.length - 10}
                    </li>
                  ) : null}
                </ul>
              </details>
            </div>
          ))}
        </div>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Voorbeeld doet géén HTTP-calls. Klik <em>Importeren</em> om de
        Discovery Engine echt te starten.
      </p>
    </div>
  );
}

function ImportSummary({ data }: { data: ImportResponse }) {
  const groups = (data.groups ?? []) as GroupResult[];
  const totals = data.totals;
  return (
    <div className="space-y-2 rounded-md border border-[hsl(var(--success))/30] bg-[hsl(var(--success))/.08] p-3 text-sm">
      <p className="flex items-center gap-1.5 font-medium text-[hsl(var(--success))]">
        <Check className="h-4 w-4" />
        Import voltooid
      </p>
      {totals ? (
        <ul className="text-xs">
          <li>Opgehaald: {totals.candidatesFetched}</li>
          <li>
            <strong>Toegevoegd aan review-queue: {totals.candidatesPersisted}</strong>
          </li>
          <li>Overgeslagen: {totals.candidatesSkipped}</li>
        </ul>
      ) : null}
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Per groep
        </summary>
        <ul className="mt-1 space-y-1">
          {groups.map((g, i) => (
            <li key={i}>
              {g.country}·{g.language}
              {g.region ? `·${g.region}` : ""} — {g.urls} URLs:
              persisted {g.result.candidatesPersisted}, skipped{" "}
              {g.result.candidatesSkipped} (
              {g.result.reasons.skipped_existing} bestond al,{" "}
              {g.result.reasons.robots_blocked} robots-blocked,{" "}
              {g.result.reasons.fetch_failed} fetch-failed)
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
