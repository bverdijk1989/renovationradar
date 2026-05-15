import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { created, ok } from "@/server/api/http";
import { requireUser } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import {
  AlertCreateSchema,
  AlertListQuerySchema,
} from "@/server/schemas/alerts";
import { createAlert, listAlerts } from "@/server/services/alerts";

export const GET = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const q = AlertListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok(await listAlerts(user.id, q));
});

export const POST = withApi(async (req: NextRequest) => {
  const user = await requireUser(req);
  const body = AlertCreateSchema.parse(await req.json());
  const alert = await createAlert(user.id, body);
  await auditLog({
    req,
    userId: user.id,
    action: "create",
    entityType: "alert",
    entityId: alert.id,
    meta: { name: alert.name, frequency: alert.frequency },
  });
  return created(alert);
});
