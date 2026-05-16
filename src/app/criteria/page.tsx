import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getActiveCriteria } from "@/server/services/criteria";
import { CriteriaForm } from "./criteria-form";

export const dynamic = "force-dynamic";

export default async function CriteriaPage() {
  const criteria = await getActiveCriteria();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Zoekcriteria"
        description="Pas de filter-criteria aan die de matches op het dashboard, de kaart en alerts bepalen. Wijzigingen werken direct."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Huidige criteria</CardTitle>
        </CardHeader>
        <CardContent>
          <CriteriaForm initial={criteria} />
        </CardContent>
      </Card>
    </div>
  );
}
