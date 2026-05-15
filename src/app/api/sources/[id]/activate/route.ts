import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { activateSource } from "@/server/services/sources";

type Params = { id: string };

export const POST = withApi<Params>(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const source = await activateSource(id);
  await auditLog({
    req,
    userId: admin.id,
    action: "update",
    entityType: "source",
    entityId: id,
    meta: { action: "activate", status: source.status },
  });
  return ok(source);
});
