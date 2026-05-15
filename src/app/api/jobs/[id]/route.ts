import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { getJob } from "@/server/services/jobs";

type Params = { id: string };

export const GET = withApi<Params>(async (req: NextRequest, ctx) => {
  await requireAdmin(req);
  const { id } = await ctx.params;
  return ok(await getJob(id));
});
