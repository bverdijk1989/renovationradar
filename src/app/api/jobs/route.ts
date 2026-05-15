import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { JobListQuerySchema } from "@/server/schemas/jobs";
import { listJobs } from "@/server/services/jobs";

export const GET = withApi(async (req: NextRequest) => {
  await requireAdmin(req);
  const q = JobListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok(await listJobs(q));
});
