import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { geocodeListing } from "@/server/geocoding";

type Params = { id: string };

/**
 * Admin-only: (re-)geocode a single listing. Useful when an admin fixed
 * the address or wants to refresh a low-confidence location.
 */
export const POST = withApi<Params>(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const outcome = await geocodeListing(id);
  await auditLog({
    req,
    userId: admin.id,
    action: "update",
    entityType: "listing_location",
    entityId: id,
    meta: {
      status: outcome.status,
      provider: outcome.provider,
      confidence: outcome.distanceConfidence,
      type: outcome.distanceType,
      distanceFromVenloKm: outcome.distanceFromVenloKm,
    },
  });
  return ok(outcome);
});
