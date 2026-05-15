import Link from "next/link";
import { Building2, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/states/empty-state";
import { COUNTRY_LABELS, label } from "@/lib/format";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AgenciesPage() {
  const agencies = await prisma.agency.findMany({
    orderBy: [{ country: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { normalizedListings: true } },
    },
  });

  return (
    <div>
      <PageHeader
        title="Makelaarbronnen"
        description="Makelaars / agencies waar listings vandaan komen. Klik op het aantal advertenties om alleen die makelaar te filteren."
      />
      {agencies.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="Nog geen makelaars geregistreerd"
          description="Makelaars worden automatisch aangemaakt door de normalisatie-pipeline of via /api/listings/manual."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {agencies.map((a) => (
            <Card key={a.id} className="p-5">
              <CardContent className="space-y-2 p-0">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium leading-tight">{a.name}</h3>
                  <Badge variant="outline">{label(COUNTRY_LABELS, a.country)}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {a._count.normalizedListings} advertentie
                  {a._count.normalizedListings === 1 ? "" : "s"}
                </p>
                <div className="flex items-center gap-3 pt-2 text-sm">
                  {a.website ? (
                    <a
                      href={a.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Website
                    </a>
                  ) : null}
                  <Link
                    href={`/listings?agencyId=${a.id}`}
                    className="text-primary hover:underline"
                  >
                    Bekijk advertenties
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
