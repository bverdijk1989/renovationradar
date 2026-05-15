import { PageHeader } from "@/components/layout/page-header";
import { ListingFilters } from "@/components/listings/listing-filters";
import { PaginationBar } from "@/components/listings/pagination-bar";
import { ListingCard, type ListingCardData } from "@/components/listings/listing-card";
import { EmptyState } from "@/components/states/empty-state";
import {
  ListingListQuerySchema,
  type ListingListQuery,
} from "@/server/schemas/listings";
import { listListings } from "@/server/services/listings";

export const dynamic = "force-dynamic";

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // Parse with safeParse so invalid URL params don't 500 the page; fall back
  // to defaults if validation fails (e.g. a stale shared link).
  const parsed = ListingListQuerySchema.safeParse(searchParams);
  const query: ListingListQuery = parsed.success
    ? parsed.data
    : ListingListQuerySchema.parse({});

  const { data, pagination } = await listListings(query);

  return (
    <div>
      <PageHeader
        title="Alle advertenties"
        description="Volledige lijst met filtering op land, prijs, grond, afstand, bijzonder object, renovatiestatus, nuts en score."
      />
      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <ListingFilters />
        <section className="space-y-4">
          <PaginationBar
            page={pagination.page}
            pageCount={pagination.pageCount}
            total={pagination.total}
          />
          {data.length === 0 ? (
            <EmptyState
              title="Geen advertenties gevonden"
              description="Pas je filters aan of verwijder enkele criteria."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.map((listing) => (
                <ListingCard
                  key={listing.id}
                  listing={listing as unknown as ListingCardData}
                />
              ))}
            </div>
          )}
          <PaginationBar
            page={pagination.page}
            pageCount={pagination.pageCount}
            total={pagination.total}
          />
        </section>
      </div>
    </div>
  );
}
