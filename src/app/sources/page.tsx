import { PageHeader } from "@/components/layout/page-header";
import { Database } from "lucide-react";
import { EmptyState } from "@/components/states/empty-state";
import { SourcesTable } from "./sources-table";
import { RunCrawlButton } from "./run-crawl-button";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  const sources = await prisma.source.findMany({
    orderBy: [{ country: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { rawListings: true, normalizedListings: true, crawlJobs: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Bronbeheer"
        description="Source Registry — robots/terms/legal status, activeren/deactiveren, rate limits. Connectors mogen alleen draaien op status=active + legalStatus=green."
        actions={<RunCrawlButton />}
      />
      {sources.length === 0 ? (
        <EmptyState
          icon={Database}
          title="Nog geen bronnen geconfigureerd"
          description="Run de seed (pnpm db:seed) of POST /api/sources om bronnen toe te voegen."
        />
      ) : (
        <SourcesTable
          sources={sources.map((s) => ({
            id: s.id,
            name: s.name,
            country: s.country,
            website: s.website,
            sourceType: s.sourceType,
            status: s.status,
            legalStatus: s.legalStatus,
            robotsStatus: s.robotsStatus,
            termsStatus: s.termsStatus,
            lastCheckedAt: s.lastCheckedAt?.toISOString() ?? null,
            rateLimitPerMinute: s.rateLimitPerMinute,
            counts: s._count,
          }))}
        />
      )}
    </div>
  );
}
