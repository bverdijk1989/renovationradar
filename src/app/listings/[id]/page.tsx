import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  MapPin,
  Sparkles,
  TreePine,
  Home,
  Zap,
  Droplet,
  Calendar,
  Building2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SaveIgnoreButtons } from "@/components/listings/save-ignore-buttons";
import {
  COUNTRY_LABELS,
  PROPERTY_TYPE_LABELS,
  RENOVATION_STATUS_LABELS,
  SPECIAL_OBJECT_LABELS,
  UTILITY_LABELS,
  AVAILABILITY_LABELS,
  formatDate,
  formatDistance,
  formatLandArea,
  formatLivingArea,
  formatPrice,
  formatRelative,
  label,
} from "@/lib/format";
import { getListing } from "@/server/services/listings";

export const dynamic = "force-dynamic";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const listing = await getListing(id).catch(() => null);
  if (!listing) notFound();

  const title = listing.titleNl ?? listing.titleOriginal;

  return (
    <article className="space-y-8">
      <Button asChild variant="ghost" size="sm">
        <Link href="/listings">
          <ArrowLeft className="h-4 w-4" />
          Terug naar alle advertenties
        </Link>
      </Button>

      <PageHeader
        title={title}
        description={[
          listing.city,
          listing.region,
          label(COUNTRY_LABELS, listing.country),
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <>
            <Button asChild variant="outline">
              <a
                href={listing.originalUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-4 w-4" />
                Bekijk origineel
              </a>
            </Button>
            <SaveIgnoreButtons listingId={listing.id} />
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        {/* Left column: photos + description + features */}
        <div className="space-y-6">
          <Gallery media={listing.media} alt={title} />

          {listing.descriptionNl || listing.descriptionOriginal ? (
            <Card>
              <CardHeader>
                <CardTitle>Beschrijving</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm leading-relaxed">
                {listing.descriptionNl ? (
                  <p>{listing.descriptionNl}</p>
                ) : null}
                {listing.descriptionOriginal &&
                listing.descriptionOriginal !== listing.descriptionNl ? (
                  <details className="rounded-md bg-muted/40 p-3 text-muted-foreground">
                    <summary className="cursor-pointer text-xs font-medium">
                      Originele beschrijving ({listing.language})
                    </summary>
                    <p className="mt-2 whitespace-pre-line">
                      {listing.descriptionOriginal}
                    </p>
                  </details>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {listing.features.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle>Kenmerken</CardTitle>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                  {listing.features
                    .filter((f) => !f.key.startsWith("_"))
                    .map((f) => (
                      <div
                        key={f.id}
                        className="flex justify-between border-b py-1.5 last:border-0"
                      >
                        <dt className="text-muted-foreground">{f.key.replace(/_/g, " ")}</dt>
                        <dd className="font-medium">{renderFeatureValue(f)}</dd>
                      </div>
                    ))}
                </dl>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {/* Right column: facts + score */}
        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-6">
              <Fact icon={Building2} label="Type">
                {listing.isSpecialObject ? (
                  <Badge variant="special">
                    <Sparkles className="h-3 w-3" />
                    {label(SPECIAL_OBJECT_LABELS, listing.specialObjectType ?? "other")}
                  </Badge>
                ) : (
                  label(PROPERTY_TYPE_LABELS, listing.propertyType)
                )}
              </Fact>
              <Fact icon={Home} label="Renovatiestatus">
                {label(RENOVATION_STATUS_LABELS, listing.renovationStatus)}
              </Fact>
              <Fact icon={TreePine} label="Grond">
                {formatLandArea(listing.landAreaM2)}
              </Fact>
              <Fact icon={Home} label="Woonoppervlak">
                {formatLivingArea(listing.livingAreaM2)}
              </Fact>
              <Fact icon={Zap} label="Stroom">
                {label(UTILITY_LABELS, listing.electricityStatus)}
              </Fact>
              <Fact icon={Droplet} label="Water">
                {label(UTILITY_LABELS, listing.waterStatus)}
              </Fact>
              <Fact icon={MapPin} label="Afstand v.a. Venlo">
                {formatDistance(listing.location?.distanceFromVenloKm ?? null)}
              </Fact>
              <Fact icon={Calendar} label="Eerst gezien">
                {formatRelative(listing.firstSeenAt)}
              </Fact>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Prijs</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tracking-tight">
                {formatPrice(listing.priceEur)}
              </p>
              <Badge variant="outline" className="mt-2">
                {label(AVAILABILITY_LABELS, listing.availability)}
              </Badge>
            </CardContent>
          </Card>

          {listing.score ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Scores</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <ScoreRow label="Composite" value={listing.score.compositeScore} primary />
                <ScoreRow label="Match" value={listing.score.matchScore} />
                <ScoreRow label="Bijzonder object" value={listing.score.specialObjectScore} />
                <ScoreRow label="Renovatie" value={listing.score.renovationScore} />
                <ScoreRow label="Data-vertrouwen" value={listing.score.dataConfidence} />
                <ScoreRow label="Investering" value={listing.score.investmentPotentialScore} />
              </CardContent>
            </Card>
          ) : null}

          {listing.agency ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Makelaar</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p className="font-medium">{listing.agency.name}</p>
                {listing.agency.website ? (
                  <a
                    href={listing.agency.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Website
                  </a>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Bron</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p className="font-medium">{listing.source.name}</p>
              <p className="text-xs text-muted-foreground">
                Type: {listing.source.sourceType} · Land:{" "}
                {label(COUNTRY_LABELS, listing.source.country)}
              </p>
              <p className="text-xs text-muted-foreground">
                Gepubliceerd: {formatDate(listing.publishedAt)}
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </article>
  );
}

function Gallery({
  media,
  alt,
}: {
  media: { id: string; url: string; caption: string | null }[];
  alt: string;
}) {
  if (media.length === 0) {
    return (
      <Card className="flex aspect-[16/9] items-center justify-center text-sm text-muted-foreground">
        Geen foto's beschikbaar
      </Card>
    );
  }
  const [hero, ...rest] = media;
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-3 md:grid-rows-2">
      <div className="relative aspect-[16/9] overflow-hidden rounded-lg md:col-span-2 md:row-span-2 md:aspect-auto">
        <Image
          src={hero!.url}
          alt={hero!.caption ?? alt}
          fill
          sizes="(max-width: 768px) 100vw, 66vw"
          className="object-cover"
          priority
        />
      </div>
      {rest.slice(0, 2).map((m) => (
        <div key={m.id} className="relative aspect-video overflow-hidden rounded-lg">
          <Image
            src={m.url}
            alt={m.caption ?? alt}
            fill
            sizes="(max-width: 768px) 100vw, 33vw"
            className="object-cover"
          />
        </div>
      ))}
    </div>
  );
}

function Fact({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
      <span className="text-right font-medium">{children}</span>
    </div>
  );
}

function ScoreRow({
  label,
  value,
  primary = false,
}: {
  label: string;
  value: number;
  primary?: boolean;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1">
      <div className="flex justify-between">
        <span className={primary ? "font-semibold" : "text-muted-foreground"}>{label}</span>
        <span className={primary ? "font-semibold" : "tabular-nums"}>{Math.round(pct)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className={primary ? "h-full bg-primary" : "h-full bg-foreground/30"}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function renderFeatureValue(f: {
  valueString: string | null;
  valueNumber: number | null;
  valueBool: boolean | null;
}): string {
  if (f.valueBool !== null) return f.valueBool ? "Ja" : "Nee";
  if (f.valueNumber !== null) return new Intl.NumberFormat("nl-NL").format(f.valueNumber);
  return f.valueString ?? "—";
}
