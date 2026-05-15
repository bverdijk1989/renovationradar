import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { geocodePending } from "@/server/geocoding";

const BodySchema = z
  .object({
    limit: z.number().int().min(1).max(1_000).optional(),
    onlyMissing: z.boolean().default(true),
    delayMs: z.number().int().min(0).max(60_000).optional(),
  })
  .default({ onlyMissing: true });

/**
 * Admin-only: geocode all listings without a ListingLocation row (the
 * default), or pass `onlyMissing=false` to re-geocode everything.
 *
 * Honours Nominatim's 1 req/sec policy via `delayMs` (default 1100ms).
 * Cache hits and "insufficient address" outcomes don't sleep.
 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = BodySchema.parse(await req.json().catch(() => ({})));
  const result = await geocodePending(body);
  await auditLog({
    req,
    userId: admin.id,
    action: "update",
    entityType: "listing_location",
    entityId: null,
    meta: { scope: "batch", ...result },
  });
  return ok(result);
});
