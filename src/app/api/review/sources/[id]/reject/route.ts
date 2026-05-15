import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { rejectSourceReview } from "@/server/services/review";

type Params = { id: string };

const BodySchema = z.object({ notes: z.string().max(5_000).optional() });

export const POST = withApi<Params>(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const body = BodySchema.parse(await req.json().catch(() => ({})));
  const source = await rejectSourceReview(id, admin.id, body.notes);
  await auditLog({
    req,
    userId: admin.id,
    action: "source_check",
    entityType: "source",
    entityId: id,
    meta: { decision: "reject", legalStatus: source.legalStatus, status: source.status },
  });
  return ok(source);
});
