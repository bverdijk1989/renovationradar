import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireUser } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { ListingSaveSchema } from "@/server/schemas/listings";
import { saveListing } from "@/server/services/listings";

type Params = { id: string };

export const POST = withApi<Params>(async (req: NextRequest, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = ListingSaveSchema.parse(await req.json().catch(() => ({})));
  const saved = await saveListing(user.id, id, body.notes);
  await auditLog({
    req,
    userId: user.id,
    action: "update",
    entityType: "listing",
    entityId: id,
    meta: { interaction: "saved" },
  });
  return ok(saved);
});
