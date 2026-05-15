"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Check,
  TrendingDown,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api-client";
import {
  COUNTRY_LABELS,
  SPECIAL_OBJECT_LABELS,
  formatPrice,
  formatRelative,
  label,
} from "@/lib/format";

type Notification = {
  id: string;
  status: "pending" | "dispatched" | "acknowledged" | "failed";
  channel: "email" | "web_push" | "in_app" | "webhook";
  eventType:
    | "new_match"
    | "price_drop"
    | "score_increased"
    | "special_object_added";
  createdAt: string;
  dispatchedAt: string | null;
  failureReason: string | null;
  payload: Record<string, unknown>;
  alert: { id: string; name: string; channel: string; frequency: string };
  listing: {
    id: string;
    titleNl: string | null;
    titleOriginal: string;
    originalUrl: string;
    priceEur: number | null;
    country: string;
    city: string | null;
    isSpecialObject: boolean;
    specialObjectType: string | null;
  };
};

const EVENT_LABELS: Record<Notification["eventType"], string> = {
  new_match: "Nieuwe match",
  price_drop: "Prijsdaling",
  score_increased: "Score gestegen",
  special_object_added: "Bijzonder object",
};

function eventIcon(t: Notification["eventType"]) {
  switch (t) {
    case "price_drop":
      return TrendingDown;
    case "score_increased":
      return TrendingUp;
    case "special_object_added":
      return Sparkles;
    default:
      return Bell;
  }
}

function statusVariant(s: Notification["status"]) {
  switch (s) {
    case "pending":
      return "warning" as const;
    case "dispatched":
      return "success" as const;
    case "acknowledged":
      return "secondary" as const;
    case "failed":
      return "destructive" as const;
  }
}

export function NotificationList({
  initial,
  counts,
}: {
  initial: Notification[];
  counts: { pending: number; dispatched: number; acknowledged: number; failed: number };
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [pendingAck, setPendingAck] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function acknowledge(id: string) {
    setPendingAck(id);
    try {
      await apiClient.post(`/api/notifications/${id}/acknowledge`, {});
      setItems((cur) =>
        cur.map((n) =>
          n.id === id ? { ...n, status: "acknowledged" } : n,
        ),
      );
      startTransition(() => router.refresh());
    } finally {
      setPendingAck(null);
    }
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="In afwachting" count={counts.pending} tone="warning" />
        <Stat label="Bezorgd" count={counts.dispatched} tone="success" />
        <Stat label="Gelezen" count={counts.acknowledged} tone="muted" />
        <Stat label="Mislukt" count={counts.failed} tone="destructive" />
      </div>

      <div className="space-y-3">
        {items.map((n) => {
          const Icon = eventIcon(n.eventType);
          const title = n.listing.titleNl ?? n.listing.titleOriginal;
          return (
            <Card key={n.id}>
              <CardContent className="grid gap-4 p-5 sm:grid-cols-[1fr_auto]">
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={statusVariant(n.status)}>
                      <Icon className="h-3 w-3" />
                      {EVENT_LABELS[n.eventType]}
                    </Badge>
                    <Badge variant="outline">{n.alert.name}</Badge>
                    <Badge variant="secondary">{n.channel}</Badge>
                    <Badge variant="secondary">{n.alert.frequency}</Badge>
                    {n.listing.isSpecialObject ? (
                      <Badge variant="special">
                        <Sparkles className="h-3 w-3" />
                        {label(
                          SPECIAL_OBJECT_LABELS,
                          n.listing.specialObjectType ?? "other",
                        )}
                      </Badge>
                    ) : null}
                  </div>
                  <Link
                    href={`/listings/${n.listing.id}`}
                    className="block text-base font-medium hover:underline"
                  >
                    {title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {[
                      n.listing.city,
                      label(COUNTRY_LABELS, n.listing.country),
                      formatPrice(n.listing.priceEur),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  <PayloadDetails payload={n.payload} eventType={n.eventType} />
                  <p className="text-xs text-muted-foreground">
                    {formatRelative(n.createdAt)}
                    {n.dispatchedAt
                      ? ` · bezorgd ${formatRelative(n.dispatchedAt)}`
                      : ""}
                  </p>
                  {n.failureReason ? (
                    <p className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-xs text-destructive">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {n.failureReason}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-start gap-2">
                  {n.status !== "acknowledged" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => acknowledge(n.id)}
                      disabled={pendingAck === n.id}
                    >
                      {pendingAck === n.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Gelezen
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}

function PayloadDetails({
  payload,
  eventType,
}: {
  payload: Record<string, unknown>;
  eventType: Notification["eventType"];
}) {
  if (eventType === "price_drop") {
    const drop = payload.dropEur as number | undefined;
    const pct = payload.dropPercent as number | undefined;
    const prev = payload.previousPriceEur as number | undefined;
    return (
      <p className="text-sm text-[hsl(var(--success))]">
        Daling van {formatPrice(prev ?? null)} → −{formatPrice(drop ?? null)}
        {pct != null ? ` (${pct.toFixed(1)}%)` : ""}
      </p>
    );
  }
  if (eventType === "score_increased") {
    const prev = payload.previousCompositeScore as number | undefined;
    const cur = payload.listingCompositeScore as number | undefined;
    return (
      <p className="text-sm text-[hsl(var(--success))]">
        Score {prev?.toFixed(0)} → {cur?.toFixed(0)}
      </p>
    );
  }
  const reasons = payload.matchedReasons as string[] | undefined;
  if (reasons?.length) {
    return (
      <details className="text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Matchredenen ({reasons.length})
        </summary>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
          {reasons.slice(0, 6).map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      </details>
    );
  }
  return null;
}

function Stat({
  label,
  count,
  tone,
}: {
  label: string;
  count: number;
  tone: "warning" | "success" | "muted" | "destructive";
}) {
  const colour =
    tone === "warning"
      ? "text-[hsl(var(--warning))]"
      : tone === "success"
        ? "text-[hsl(var(--success))]"
        : tone === "destructive"
          ? "text-destructive"
          : "text-muted-foreground";
  return (
    <Card className="p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${colour}`}>{count}</p>
    </Card>
  );
}
