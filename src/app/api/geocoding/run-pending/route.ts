import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api/handler";
import { ok, UnauthorizedError } from "@/server/api/http";
import { getActor } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { geocodePending } from "@/server/geocoding";

export const dynamic = "force-dynamic";

const BodySchema = z
  .object({
    limit: z.number().int().min(1).max(1_000).optional(),
    onlyMissing: z.boolean().default(true),
    delayMs: z.number().int().min(0).max(60_000).optional(),
  })
  .default({ onlyMissing: true });

/**
 * Geocode all listings without a ListingLocation row (default), or pass
 * `onlyMissing=false` to re-geocode everything.
 *
 * Twee auth-modi:
 *   - Bearer CRON_TOKEN: cron-trigger zonder admin-cookie
 *   - Admin role via dev-cookie/header: interactief vanuit de UI
 *
 * Honours Nominatim's 1 req/sec policy via `delayMs` (default 1100ms).
 */
export const POST = withApi(async (req: NextRequest) => {
  const cronToken = process.env.CRON_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  const provided = bearerMatch?.[1] ?? "";
  const validCronCall =
    cronToken && cronToken.length >= 16 && timingSafeEqual(provided, cronToken);

  let adminId: string | null = null;
  if (!validCronCall) {
    const actor = await getActor(req);
    if (!actor.user || actor.user.role !== "admin") {
      throw new UnauthorizedError(
        "Geocoding endpoint vereist admin-rol of geldige Bearer CRON_TOKEN",
      );
    }
    adminId = actor.user.id;
  }

  const body = BodySchema.parse(await req.json().catch(() => ({})));
  const result = await geocodePending(body);
  await auditLog({
    req,
    userId: adminId,
    action: "update",
    entityType: "listing_location",
    entityId: null,
    meta: { scope: "batch", trigger: validCronCall ? "cron" : "admin", ...result },
  });
  return ok(result);
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
