import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { SearchProfilePatchSchema } from "@/server/schemas/search-profiles";
import { patchSearchProfile } from "@/server/services/search-profiles";

type Params = { id: string };

export const PATCH = withApi<Params>(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const body = SearchProfilePatchSchema.parse(await req.json());
  const profile = await patchSearchProfile(id, body);
  await auditLog({
    req,
    userId: admin.id,
    action: "update",
    entityType: "search_profile",
    entityId: id,
    meta: body,
  });
  return ok(profile);
});
