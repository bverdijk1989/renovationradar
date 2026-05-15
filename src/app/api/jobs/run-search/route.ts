import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { created } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { RunSearchJobSchema } from "@/server/schemas/jobs";
import { enqueueSearchJob } from "@/server/services/jobs";

export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = RunSearchJobSchema.parse(await req.json());
  const job = await enqueueSearchJob(body);
  await auditLog({
    req,
    userId: admin.id,
    action: "crawl_started",
    entityType: "crawl_job",
    entityId: job.id,
    meta: { sourceId: body.sourceId, searchProfileId: body.searchProfileId },
  });
  return created(job);
});
