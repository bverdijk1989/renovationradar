import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { runDigest } from "@/server/alerts";

const BodySchema = z
  .object({
    frequency: z.enum(["daily", "weekly"]).default("daily"),
    alertId: z.string().uuid().optional(),
  })
  .default({ frequency: "daily" });

/**
 * Admin-only: trigger a digest run inline. The BullMQ scheduler (fase 5+)
 * will call the same engine entry point on a cron schedule (08:00 local
 * for daily, Monday 08:00 for weekly).
 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = BodySchema.parse(await req.json().catch(() => ({})));
  const result = await runDigest({
    frequency: body.frequency,
    alertId: body.alertId,
  });
  await auditLog({
    req,
    userId: admin.id,
    action: "alert_dispatched",
    entityType: "alert",
    entityId: body.alertId ?? null,
    meta: { ...result, frequency: body.frequency } as never,
  });
  return ok(result);
});
