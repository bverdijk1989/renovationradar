"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Play, Loader2, AlertCircle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

type RunResult = {
  started?: boolean;
  mode?: string;
  message?: string;
  totalSources?: number;
  succeeded?: number;
  failed?: number;
  normalize?: { totalCandidates: number; succeeded: number };
  geocode?: { succeeded: number; skipped: number; failed: number };
};

/**
 * "Start nieuwe crawl"-knop op /sources. Roept /api/jobs/run-all aan
 * (admin-cookie wordt automatisch meegestuurd via credentials: same-origin).
 *
 * De call kan minuten duren (per source ~5-15s, normalize + geocode er
 * bovenop). Knop toont busy-state + concrete result-stats zodra de batch
 * klaar is, of een error-banner bij failure.
 */
export function RunCrawlButton() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  async function run() {
    if (
      !confirm(
        "Crawl + normalize + geocode starten voor ALLE active+green sources?\n\n" +
          "De crawl draait op de achtergrond (5-30 min). Je krijgt direct een " +
          "bevestiging — daarna mag je de tab sluiten. Resultaten verschijnen " +
          "automatisch op /listings + /map zodra rijen binnenkomen.",
      )
    ) {
      return;
    }
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      // Async mode (default voor admin-calls): API returnt direct met
      // started:true. De crawl loopt server-side door.
      const res = await fetch("/api/jobs/run-all", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      // Veilige response-parse: niet alles is JSON (nginx 504 = HTML).
      const text = await res.text();
      let json: RunResult | null = null;
      try {
        json = JSON.parse(text) as RunResult;
      } catch {
        // No-op — we tonen de raw text als error
      }
      if (!res.ok) {
        const msg =
          json?.message ??
          (text.length > 0 && text.length < 200
            ? text
            : `Mislukt (HTTP ${res.status})`);
        throw new Error(msg);
      }
      if (!json) {
        throw new Error("Onverwacht antwoord van de server");
      }
      setResult(json);
      startTransition(() => router.refresh());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={run} disabled={busy}>
        {busy ? (
          <>
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            Bezig met crawl…
          </>
        ) : (
          <>
            <Play className="mr-1 h-4 w-4" />
            Start nieuwe crawl
          </>
        )}
      </Button>
      {error ? (
        <p className="flex items-start gap-1 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3 w-3" />
          {error}
        </p>
      ) : null}
      {result ? (
        <p className="flex max-w-xs items-start gap-1 text-xs text-emerald-600">
          <Check className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            {result.started
              ? (result.message ?? "Crawl gestart op de achtergrond.")
              : `${result.totalSources} sources, ${result.succeeded} ok, ${result.failed} failed${
                  result.normalize ? ` · ${result.normalize.succeeded} normalized` : ""
                }${result.geocode ? ` · ${result.geocode.succeeded} geocoded` : ""}`}
          </span>
        </p>
      ) : null}
    </div>
  );
}
