import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { created } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { ListingManualCreateSchema } from "@/server/schemas/listings";
import { manualCreateListing } from "@/server/services/listings";

export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = ListingManualCreateSchema.parse(await req.json());
  const listing = await manualCreateListing(body);
  await auditLog({
    req,
    userId: admin.id,
    action: "create",
    entityType: "listing",
    entityId: listing.id,
    meta: { source: "manual", country: listing.country },
  });
  return created(listing);
});
