import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { scoreListingById } from "@/server/services/scoring";

type Params = { id: string };

export const POST = withApi<Params>(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const score = await scoreListingById(id);
  await auditLog({
    req,
    userId: admin.id,
    action: "update",
    entityType: "listing_score",
    entityId: id,
    meta: { compositeScore: score.compositeScore, scorerVersion: score.scorerVersion },
  });
  return ok(score);
});
