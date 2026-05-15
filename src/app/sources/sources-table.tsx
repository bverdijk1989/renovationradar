"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, Power, PowerOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState } from "@/components/states/error-state";
import { activateSource, deactivateSource } from "@/hooks/use-sources";
import {
  COUNTRY_LABELS,
  LEGAL_STATUS_LABELS,
  SOURCE_STATUS_LABELS,
  formatRelative,
  label,
} from "@/lib/format";

export type SourceRow = {
  id: string;
  name: string;
  country: string;
  website: string;
  sourceType: string;
  status: string;
  legalStatus: string;
  robotsStatus: string;
  termsStatus: string;
  lastCheckedAt: string | null;
  rateLimitPerMinute: number | null;
  counts: { rawListings: number; normalizedListings: number; crawlJobs: number };
};

export function SourcesTable({ sources }: { sources: SourceRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function act(action: "activate" | "deactivate", id: string) {
    setError(null);
    try {
      if (action === "activate") await activateSource(id);
      else await deactivateSource(id);
      startTransition(() => router.refresh());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Mislukt");
    }
  }

  return (
    <div className="space-y-3">
      {error ? <ErrorState description={error} /> : null}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Bron</th>
                <th className="p-3 text-left">Land</th>
                <th className="p-3 text-left">Type</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Legal</th>
                <th className="p-3 text-left">Laatst gecontroleerd</th>
                <th className="p-3 text-right">Listings</th>
                <th className="p-3 text-right">Acties</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sources.map((s) => (
                <tr key={s.id}>
                  <td className="p-3">
                    <div className="font-medium">{s.name}</div>
                    <a
                      href={s.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                    >
                      {s.website.length > 40 ? `${s.website.slice(0, 40)}…` : s.website}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </td>
                  <td className="p-3">{label(COUNTRY_LABELS, s.country)}</td>
                  <td className="p-3 text-muted-foreground">{s.sourceType}</td>
                  <td className="p-3">
                    <Badge variant={statusVariant(s.status)}>
                      {label(SOURCE_STATUS_LABELS, s.status)}
                    </Badge>
                  </td>
                  <td className="p-3">
                    <Badge variant={legalVariant(s.legalStatus)}>
                      {label(LEGAL_STATUS_LABELS, s.legalStatus)}
                    </Badge>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">
                    {s.lastCheckedAt ? formatRelative(s.lastCheckedAt) : "Nooit"}
                  </td>
                  <td className="p-3 text-right tabular-nums">
                    {s.counts.normalizedListings}
                  </td>
                  <td className="p-3 text-right">
                    {s.status === "active" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => act("deactivate", s.id)}
                        disabled={pending}
                      >
                        <PowerOff className="h-3.5 w-3.5" />
                        Pauzeer
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => act("activate", s.id)}
                        disabled={pending || s.legalStatus !== "green"}
                        title={
                          s.legalStatus !== "green"
                            ? "Legal status moet 'green' zijn"
                            : undefined
                        }
                      >
                        <Power className="h-3.5 w-3.5" />
                        Activeer
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function statusVariant(status: string) {
  if (status === "active") return "success" as const;
  if (status === "blocked") return "destructive" as const;
  if (status === "pending_review") return "warning" as const;
  return "secondary" as const;
}

function legalVariant(legal: string) {
  if (legal === "green") return "success" as const;
  if (legal === "red") return "destructive" as const;
  if (legal === "amber") return "warning" as const;
  return "secondary" as const;
}
