import Link from "next/link";
import { Bell } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/states/empty-state";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/server/api/auth";
import { AlertsManager } from "./alerts-manager";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div>
        <PageHeader title="Alerts" />
        <EmptyState
          icon={Bell}
          title="Log eerst in"
          description="Alerts zijn per gebruiker. Stel een dev user in via /login om alerts te beheren."
          action={
            <Button asChild>
              <Link href="/login">Naar login</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Alerts"
        description="Sla zoekprofielen op en ontvang een melding zodra een nieuwe match binnenkomt."
      />
      <AlertsManager />
    </div>
  );
}
