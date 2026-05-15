import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { ListingPatchSchema } from "@/server/schemas/listings";
import { getListing, patchListing } from "@/server/services/listings";

type Params = { id: string };

export const GET = withApi<Params>(async (_req, ctx) => {
  const { id } = await ctx.params;
  return ok(await getListing(id));
});

export const PATCH = withApi<Params>(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const body = ListingPatchSchema.parse(await req.json());
  const listing = await patchListing(id, body);
  await auditLog({
    req,
    userId: admin.id,
    action: "update",
    entityType: "listing",
    entityId: id,
    meta: body,
  });
  return ok(listing);
});
