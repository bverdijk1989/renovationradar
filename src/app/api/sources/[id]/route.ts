import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { SourcePatchSchema } from "@/server/schemas/sources";
import { getSource, patchSource } from "@/server/services/sources";

type Params = { id: string };

export const GET = withApi<Params>(async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await getSource(id));
});

export const PATCH = withApi<Params>(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const body = SourcePatchSchema.parse(await req.json());
  const source = await patchSource(id, body);
  await auditLog({
    req,
    userId: admin.id,
    action: "update",
    entityType: "source",
    entityId: id,
    meta: body,
  });
  return ok(source);
});
