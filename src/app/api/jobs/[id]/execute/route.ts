import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { executeQueuedJob } from "@/server/services/jobs";

type Params = { id: string };

/**
 * Admin-only: run a queued CrawlJob INLINE (no BullMQ worker required).
 * Mostly for dev — once the BullMQ worker is wired, queued jobs auto-execute.
 */
export const POST = withApi<Params>(async (req: NextRequest, ctx) => {
  const admin = await requireAdmin(req);
  const { id } = await ctx.params;
  const result = await executeQueuedJob(id);
  await auditLog({
    req,
    userId: admin.id,
    action: result.ok ? "crawl_finished" : "crawl_finished",
    entityType: "crawl_job",
    entityId: id,
    meta: result as never,
  });
  return ok(result);
});
