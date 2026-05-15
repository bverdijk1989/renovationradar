import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { PaginationSchema } from "@/server/api/pagination";
import { listListingsForReview } from "@/server/services/review";

export const GET = withApi(async (req: NextRequest) => {
  await requireAdmin(req);
  const q = PaginationSchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok(await listListingsForReview(q));
});
