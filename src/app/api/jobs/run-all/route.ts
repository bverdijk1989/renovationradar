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
 *   - Bearer CRON_TOKEN: voor de systemd timer (`async=false`, sync run
 *     met curl-timeout van 30 min)
 *   - Admin role via dev-cookie/header: voor de "Start nieuwe crawl"
 *     knop op /sources. Default `async=true` zodat de UI direct een
 *     response krijgt (nginx 60s timeout) en de crawl op de achtergrond
 *     verder kan lopen.
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

  const url = new URL(req.url);
  // Default: cron = sync (krijgt result terug), UI = async (start +
  // direct response zodat nginx niet 504't op de 60s read-timeout).
  const asyncMode = url.searchParams.get("async") === "false"
    ? false
    : !validCronCall;

  if (asyncMode) {
    // Fire-and-forget. Het Next.js process houdt de Promise vast tot
    // 'ie klaar is (long-lived `next start`); errors zijn zichtbaar
    // in journalctl -u renovationradar.service.
    runAllActiveSources()
      .then((result) =>
        auditLog({
          userId: adminId,
          action: "crawl_finished",
          entityType: "crawl_job",
          entityId: null,
          meta: {
            trigger: "admin-async",
            sources: result.totalSources,
            succeeded: result.succeeded,
            failed: result.failed,
            normalize: result.normalize,
            geocode: result.geocode,
          },
        }).catch(() => {}),
      )
      .catch((err) => {
        console.error("[run-all async] crawl failed:", err);
      });
    await auditLog({
      req,
      userId: adminId,
      action: "crawl_started",
      entityType: "crawl_job",
      entityId: null,
      meta: { trigger: "admin-async" },
    });
    return ok({
      started: true,
      mode: "async",
      message:
        "Crawl gestart in de achtergrond. Voortgang verschijnt vanzelf op /sources zodra rijen binnenkomen.",
    });
  }

  // Sync mode (cron / explicit ?async=false)
  const result = await runAllActiveSources();
  await auditLog({
    req,
    userId: adminId,
    action: "crawl_started",
    entityType: "crawl_job",
    entityId: null,
    meta: {
      trigger: validCronCall ? "cron" : "admin-sync",
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
