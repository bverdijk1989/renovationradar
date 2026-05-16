import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { getActiveCriteria, updateCriteria } from "@/server/services/criteria";

export const dynamic = "force-dynamic";

const CountrySchema = z.enum(["FR", "BE", "DE", "NL"]);

const PatchSchema = z
  .object({
    maxPriceEur: z.number().int().min(1).max(10_000_000),
    minLandM2: z.number().int().min(0).max(10_000_000),
    requireDetached: z.boolean(),
    requireElectricity: z.boolean(),
    preferWater: z.boolean(),
    includeSpecialObjects: z.boolean(),
    maxDistanceKm: z.number().min(1).max(2000),
    countries: z.array(CountrySchema).min(1),
    notes: z.string().max(2000).nullable(),
  })
  .partial();

/**
 * GET /api/criteria — geen auth, dashboard + map lezen 'm publiek.
 *
 * PUT /api/criteria — admin-only, valideert + audit-logt.
 */
export const GET = withApi(async () => {
  return ok(await getActiveCriteria());
});

export const PUT = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = PatchSchema.parse(await req.json());
  const updated = await updateCriteria(body, admin.id);
  await auditLog({
    req,
    userId: admin.id,
    action: "update",
    entityType: "search_criteria",
    entityId: "default",
    meta: body as never,
  });
  return ok(updated);
});
