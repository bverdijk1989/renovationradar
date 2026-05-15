import { PageHeader } from "@/components/layout/page-header";
import { ListingCard, type ListingCardData } from "@/components/listings/listing-card";
import { EmptyState } from "@/components/states/empty-state";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";
import { SPECIAL_OBJECT_LABELS, label } from "@/lib/format";
import { getSpecialObjects } from "@/server/services/dashboard";
import { toCard } from "@/components/dashboard/top-matches";

export const dynamic = "force-dynamic";

export default async function SpecialObjectsPage() {
  const items = await getSpecialObjects(48);

  // Groepeer per specialObjectType voor visuele indeling
  const groups = new Map<string, typeof items>();
  for (const it of items) {
    const k = it.specialObjectType ?? "other";
    const g = groups.get(k) ?? [];
    g.push(it);
    groups.set(k, g);
  }

  return (
    <div className="space-y-10">
      <PageHeader
        title="Bijzondere objecten"
        description="Molens, watermolens, stationsgebouwen, sluiswachterswoningen, vuurtorens en andere zeldzame objecten. Gesorteerd op composite score."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="Nog geen bijzondere objecten"
          description="Activeer een bron of voeg handmatig een listing toe met is_special_object=true."
        />
      ) : (
        Array.from(groups.entries()).map(([type, list]) => (
          <section key={type}>
            <div className="mb-3 flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[hsl(var(--special))]" />
              <h2 className="text-lg font-semibold">
                {label(SPECIAL_OBJECT_LABELS, type)}
              </h2>
              <Badge variant="secondary">{list.length}</Badge>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {list.map((m) => (
                <ListingCard
                  key={m.id}
                  listing={toCard(m) as ListingCardData}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
