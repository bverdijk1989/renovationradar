import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok, UnauthorizedError } from "@/server/api/http";
import { getActor } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { runAllActiveSources } from "@/server/services/jobs";

export const dynamic = "force-dynamic";

/**
 * Trigger crawl + normalize + geocode voor alle active+green sources.
 *
 * Twee auth-modi:
 *   - Bearer CRON_TOKEN: voor de systemd timer (geen cookie nodig)
 *   - Admin role via dev-cookie/header: voor de "Start nieuwe crawl"
 *     knop op /sources
 */
export const POST = withApi(async (req: NextRequest) => {
  const cronToken = process.env.CRON_TOKEN;
  const header = req.headers.get("authorization") ?? "";
  const bearerMatch = header.match(/^Bearer\s+(.+)$/i);
  const provided = bearerMatch?.[1] ?? "";
  const validCronCall =
    !!cronToken &&
    cronToken.length >= 16 &&
    timingSafeEqual(provided, cronToken);

  let adminId: string | null = null;
  if (!validCronCall) {
    const actor = await getActor(req);
    if (!actor.user || actor.user.role !== "admin") {
      throw new UnauthorizedError(
        "Crawl-trigger vereist admin-rol of geldige Bearer CRON_TOKEN",
      );
    }
    adminId = actor.user.id;
  }

  const result = await runAllActiveSources();
  await auditLog({
    req,
    userId: adminId,
    action: "crawl_started",
    entityType: "crawl_job",
    entityId: null,
    meta: {
      trigger: validCronCall ? "cron" : "admin",
      sources: result.totalSources,
      succeeded: result.succeeded,
      failed: result.failed,
    },
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
