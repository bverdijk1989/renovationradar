import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireUser } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { ListingIgnoreSchema } from "@/server/schemas/listings";
import { ignoreListing } from "@/server/services/listings";

type Params = { id: string };

export const POST = withApi<Params>(async (req: NextRequest, ctx) => {
  const user = await requireUser(req);
  const { id } = await ctx.params;
  const body = ListingIgnoreSchema.parse(await req.json().catch(() => ({})));
  const result = await ignoreListing(user.id, id, body.reason);
  await auditLog({
    req,
    userId: user.id,
    action: "update",
    entityType: "listing",
    entityId: id,
    meta: { interaction: "ignored", reason: body.reason },
  });
  return ok(result);
});
