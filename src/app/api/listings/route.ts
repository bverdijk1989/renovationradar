import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { ListingListQuerySchema } from "@/server/schemas/listings";
import { listListings } from "@/server/services/listings";

export const GET = withApi(async (req: NextRequest) => {
  const q = ListingListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok(await listListings(q));
});
