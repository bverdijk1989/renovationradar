import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Activity, FileText } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  COUNTRY_LABELS,
  LEGAL_STATUS_LABELS,
  SOURCE_STATUS_LABELS,
  formatRelative,
  label,
} from "@/lib/format";
import { getSource } from "@/server/services/sources";
import { SourceConnectorForm } from "./connector-form";

export const dynamic = "force-dynamic";

export default async function SourceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let source;
  try {
    source = await getSource(id);
  } catch {
    notFound();
  }

  return (
    <div className="space-y-6">
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2">
          <Link href="/sources">
            <ArrowLeft className="mr-1 h-4 w-4" />
            Terug naar bronnen
          </Link>
        </Button>
        <PageHeader title={source.name} className="mb-2" />
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{label(COUNTRY_LABELS, source.country)}</Badge>
          <Badge>{label(SOURCE_STATUS_LABELS, source.status)}</Badge>
          <Badge variant={source.legalStatus === "green" ? "default" : "outline"}>
            Legal: {label(LEGAL_STATUS_LABELS, source.legalStatus)}
          </Badge>
          <a
            href={source.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline"
          >
            {source.website}
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      </div>

      <SourceConnectorForm
        sourceId={source.id}
        initialSourceType={source.sourceType}
        initialCollectionMethods={source.collectionMethods}
        initialConnectorConfig={(source.connectorConfig ?? {}) as Record<string, unknown>}
        initialWebsite={source.website}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Activiteit
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <Metric label="Crawl jobs" value={source._count.crawlJobs} />
          <Metric label="Raw listings" value={source._count.rawListings} />
          <Metric label="Normalized listings" value={source._count.normalizedListings} />
        </CardContent>
      </Card>

      {source.notes ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4" />
              Notities (discovery + reviews)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
              {source.notes}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      {source.reviews.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Review-historie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {source.reviews.map((r) => (
              <div key={r.id} className="rounded-md border border-border/60 p-3 text-sm">
                <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatRelative(r.createdAt)}</span>
                  <Badge variant="outline" className="text-[10px]">
                    legal: {r.legalStatusAfter}
                  </Badge>
                </div>
                <p className="text-sm">{r.notes ?? "—"}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border/60 p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
