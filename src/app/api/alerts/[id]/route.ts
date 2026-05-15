import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireUser } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { AlertPatchSchema } from "@/server/schemas/alerts";
import { patchAlert } from "@/server/services/alerts";

type Params = { id: string };

export const PATCH = withApi<Params>(async (req: NextRequest, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = AlertPatchSchema.parse(await req.json());
  const alert = await patchAlert(user.id, id, body);
  await auditLog({
    req,
    userId: user.id,
    action: "update",
    entityType: "alert",
    entityId: id,
    meta: body,
  });
  return ok(alert);
});
