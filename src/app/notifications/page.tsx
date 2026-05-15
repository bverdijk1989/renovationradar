import Link from "next/link";
import { Bell, BellOff } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/api/auth";
import { listUserNotifications } from "@/server/alerts";
import { NotificationList } from "./notification-list";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div>
        <PageHeader title="Meldingen" />
        <EmptyState
          icon={BellOff}
          title="Log eerst in"
          description="Meldingen worden per gebruiker bijgehouden. Ga naar /login."
          action={
            <Button asChild>
              <Link href="/login">Naar login</Link>
            </Button>
          }
        />
      </div>
    );
  }

  const notifications = await listUserNotifications(user.id, { limit: 100 });

  const pending = notifications.filter((n) => n.status === "pending");
  const dispatched = notifications.filter((n) => n.status === "dispatched");
  const acknowledged = notifications.filter((n) => n.status === "acknowledged");
  const failed = notifications.filter((n) => n.status === "failed");

  return (
    <div className="space-y-8">
      <PageHeader
        title="Meldingen"
        description="Realtime + dagelijkse digest-meldingen van je alerts. Klik 'Gelezen' om een melding te bevestigen."
      />

      {notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="Nog geen meldingen"
          description="Stel een alert in op /alerts. Zodra er een nieuwe match binnenkomt verschijnt hij hier."
        />
      ) : (
        <NotificationList
          initial={notifications.map((n) => ({
            id: n.id,
            status: n.status,
            channel: n.channel,
            eventType: n.eventType,
            createdAt: n.createdAt.toISOString(),
            dispatchedAt: n.dispatchedAt?.toISOString() ?? null,
            failureReason: n.failureReason,
            payload: n.payload as Record<string, unknown>,
            alert: n.alert,
            listing: n.listing,
          }))}
          counts={{
            pending: pending.length,
            dispatched: dispatched.length,
            acknowledged: acknowledged.length,
            failed: failed.length,
          }}
        />
      )}
    </div>
  );
}
