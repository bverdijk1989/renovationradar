import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { SourceCheckSchema } from "@/server/schemas/sources";
import { checkSource } from "@/server/services/sources";

type Params = { id: string };

export const POST = withApi<Params>(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const body = SourceCheckSchema.parse(await req.json());
  const source = await checkSource(id, body, admin.id);
  await auditLog({
    req,
    userId: admin.id,
    action: "source_check",
    entityType: "source",
    entityId: id,
    meta: body,
  });
  return ok(source);
});
