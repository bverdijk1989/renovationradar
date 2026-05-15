import type { NextRequest } from "next/server";
import { z } from "zod";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { dispatchPending } from "@/server/alerts";

const BodySchema = z
  .object({ limit: z.number().int().min(1).max(1000).optional() })
  .default({});

/**
 * Admin-only: drain pending AlertNotification rows. Useful as a retry after
 * a transient channel failure (e.g. email provider was down).
 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = BodySchema.parse(await req.json().catch(() => ({})));
  const result = await dispatchPending(body.limit);
  await auditLog({
    req,
    userId: admin.id,
    action: "alert_dispatched",
    entityType: "alert_notification",
    entityId: null,
    meta: result as never,
  });
  return ok(result);
});
