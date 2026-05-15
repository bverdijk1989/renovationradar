import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { ScoringRecalculateSchema } from "@/server/schemas/jobs";
import { recalculateAllScores } from "@/server/services/scoring";

export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = ScoringRecalculateSchema.parse(await req.json().catch(() => ({})));
  const result = await recalculateAllScores({ listingIds: body.listingIds });
  await auditLog({
    req,
    userId: admin.id,
    action: "update",
    entityType: "listing_score",
    entityId: null,
    meta: { recalculated: result.processed, scope: body.listingIds ? "filtered" : "all" },
  });
  return ok(result);
});
