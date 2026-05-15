import Link from "next/link";
import { Bookmark } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ListingCard, type ListingCardData } from "@/components/listings/listing-card";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/server/api/auth";
import { toCard } from "@/components/dashboard/top-matches";

export const dynamic = "force-dynamic";

export default async function SavedListingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div>
        <PageHeader title="Bewaarde advertenties" />
        <EmptyState
          icon={Bookmark}
          title="Log eerst in"
          description="Bewaren werkt per gebruiker. Stel een dev user in via /login."
          action={
            <Button asChild>
              <Link href="/login">Naar login</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const saved = await prisma.savedListing.findMany({
    where: { userId: user.id, kind: "saved" },
    orderBy: { updatedAt: "desc" },
    include: {
      normalizedListing: {
        include: {
          location: true,
          score: true,
          source: { select: { id: true, name: true, country: true } },
          agency: { select: { id: true, name: true } },
          media: {
            take: 1,
            orderBy: { sortOrder: "asc" },
            select: { id: true, url: true, caption: true },
          },
        },
      },
    },
  });

  return (
    <div>
      <PageHeader
        title="Bewaarde advertenties"
        description={`${saved.length} bewaard${saved.length === 1 ? "e" : "e"} listing${saved.length === 1 ? "" : "s"}`}
      />
      {saved.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title="Nog geen bewaarde advertenties"
          description="Gebruik de 'Bewaar' knop op een advertentie om hem hier te zien."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {saved.map((s) => (
            <ListingCard
              key={s.id}
              listing={toCard(s.normalizedListing) as ListingCardData}
            />
          ))}
        </div>
      )}
    </div>
  );
}
