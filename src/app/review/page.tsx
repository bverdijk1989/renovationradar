import { PageHeader } from "@/components/layout/page-header";
import { CheckSquare, Sparkles, Building2, Globe, HelpCircle, X as XIcon } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReviewActions } from "./review-actions";
import { DiscoveryForm } from "./discovery-form";
import { CsvImportForm } from "./csv-import-form";
import {
  COUNTRY_LABELS,
  LEGAL_STATUS_LABELS,
  SOURCE_STATUS_LABELS,
  formatRelative,
  label,
} from "@/lib/format";
import { prisma } from "@/lib/db";
import type { SourceClassification } from "@prisma/client";

export const dynamic = "force-dynamic";

const CLASSIFICATION_LABELS: Record<SourceClassification, string> = {
  real_estate_agency: "Makelaarskantoor",
  portal: "Vastgoedportal",
  irrelevant: "Niet relevant",
  unknown: "Onbekend",
};

function classificationVariant(c: SourceClassification) {
  switch (c) {
    case "real_estate_agency":
      return "success" as const;
    case "portal":
      return "warning" as const;
    case "irrelevant":
      return "destructive" as const;
    case "unknown":
      return "secondary" as const;
  }
}

function classificationIcon(c: SourceClassification) {
  switch (c) {
    case "real_estate_agency":
      return Building2;
    case "portal":
      return Globe;
    case "irrelevant":
      return XIcon;
    case "unknown":
      return HelpCircle;
  }
}

type DiscoveryMeta = {
  provider?: string;
  reason?: string;
  classificationConfidence?: number;
  classificationEvidence?: string[];
  robotsEvidence?: string;
  extracted?: {
    email?: string | null;
    phone?: string | null;
    listingPageUrl?: string | null;
    region?: string | null;
    language?: string | null;
  };
};

export default async function ReviewQueuePage() {
  const sources = await prisma.source.findMany({
    where: {
      OR: [{ status: "pending_review" }, { legalStatus: "pending_review" }],
    },
    orderBy: { createdAt: "desc" },
    include: { reviews: { take: 1, orderBy: { createdAt: "desc" } } },
  });

  const buckets: Record<SourceClassification, number> = {
    real_estate_agency: 0,
    portal: 0,
    irrelevant: 0,
    unknown: 0,
  };
  for (const s of sources) buckets[s.classification] += 1;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Review wachtrij"
        description="Bronnen die wachten op een ToS/robots.txt-controle voordat ze actief mogen worden. Niets wordt automatisch geactiveerd."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(Object.entries(buckets) as Array<[SourceClassification, number]>).map(
          ([cls, count]) => {
            const Icon = classificationIcon(cls);
            return (
              <Card key={cls} className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {CLASSIFICATION_LABELS[cls]}
                    </p>
                    <p className="mt-1 text-2xl font-semibold tabular-nums">{count}</p>
                  </div>
                  <Icon className="h-5 w-5 text-muted-foreground" />
                </div>
              </Card>
            );
          },
        )}
      </div>

      <DiscoveryForm />

      <CsvImportForm />

      {sources.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title="Niets te beoordelen"
          description="Alle bronnen hebben een definitieve legal status. Gebruik het 'Discovery' formulier hierboven om nieuwe makelaars te vinden."
        />
      ) : (
        <div className="space-y-3">
          {sources.map((s) => {
            const Icon = classificationIcon(s.classification);
            const meta = (s.discoveryMeta as DiscoveryMeta | null) ?? null;
            return (
              <Card key={s.id} className="p-5">
                <CardContent className="grid gap-4 p-0 lg:grid-cols-[1fr_auto]">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{s.name}</h3>
                      <Badge variant="outline">{label(COUNTRY_LABELS, s.country)}</Badge>
                      <Badge variant={classificationVariant(s.classification)}>
                        <Icon className="h-3 w-3" />
                        {CLASSIFICATION_LABELS[s.classification]}
                        {meta?.classificationConfidence != null
                          ? ` · ${Math.round(meta.classificationConfidence * 100)}%`
                          : ""}
                      </Badge>
                      <Badge variant="warning">{label(SOURCE_STATUS_LABELS, s.status)}</Badge>
                      <Badge variant="warning">
                        Legal: {label(LEGAL_STATUS_LABELS, s.legalStatus)}
                      </Badge>
                    </div>

                    <a
                      href={s.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block text-sm text-primary hover:underline"
                    >
                      {s.website}
                    </a>

                    <p className="text-sm text-muted-foreground">
                      Type: {s.sourceType} · Methodes: {s.collectionMethods.join(", ") || "—"}
                    </p>

                    {meta?.reason ? (
                      <p className="flex items-start gap-1.5 text-sm">
                        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[hsl(var(--special))]" />
                        <span>
                          <span className="font-medium">Gevonden:</span> {meta.reason}
                          {meta.provider ? ` (via ${meta.provider})` : ""}
                        </span>
                      </p>
                    ) : null}

                    {meta?.classificationEvidence?.length ? (
                      <details className="text-sm">
                        <summary className="cursor-pointer text-muted-foreground">
                          Classificatie-bewijs ({meta.classificationEvidence.length})
                        </summary>
                        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                          {meta.classificationEvidence.slice(0, 8).map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </details>
                    ) : null}

                    {meta?.extracted &&
                    (meta.extracted.email ||
                      meta.extracted.phone ||
                      meta.extracted.listingPageUrl) ? (
                      <div className="rounded-md bg-muted/40 p-3 text-xs">
                        {meta.extracted.email ? (
                          <div>
                            <span className="font-medium">E-mail (publiek):</span>{" "}
                            {meta.extracted.email}
                          </div>
                        ) : null}
                        {meta.extracted.phone ? (
                          <div>
                            <span className="font-medium">Telefoon (publiek):</span>{" "}
                            {meta.extracted.phone}
                          </div>
                        ) : null}
                        {meta.extracted.listingPageUrl ? (
                          <div>
                            <span className="font-medium">Mogelijke listings:</span>{" "}
                            <a
                              href={meta.extracted.listingPageUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary hover:underline"
                            >
                              {meta.extracted.listingPageUrl}
                            </a>
                          </div>
                        ) : null}
                      </div>
                    ) : null}

                    {meta?.robotsEvidence ? (
                      <p className="text-xs text-muted-foreground">
                        robots.txt: {meta.robotsEvidence}
                      </p>
                    ) : null}

                    {s.notes && !meta ? (
                      <p className="rounded-md bg-muted/50 p-3 text-sm">{s.notes}</p>
                    ) : null}

                    {s.reviews[0] ? (
                      <p className="text-xs text-muted-foreground">
                        Vorige review: {formatRelative(s.reviews[0].createdAt)}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-start gap-2">
                    <ReviewActions sourceId={s.id} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
