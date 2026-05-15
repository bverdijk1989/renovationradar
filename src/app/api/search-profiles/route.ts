import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { created, ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import {
  SearchProfileCreateSchema,
  SearchProfileListQuerySchema,
} from "@/server/schemas/search-profiles";
import {
  createSearchProfile,
  listSearchProfiles,
} from "@/server/services/search-profiles";

export const GET = withApi(async (req: NextRequest) => {
  const q = SearchProfileListQuerySchema.parse(
    Object.fromEntries(req.nextUrl.searchParams),
  );
  return ok(await listSearchProfiles(q));
});

export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = SearchProfileCreateSchema.parse(await req.json());
  const profile = await createSearchProfile(body);
  await auditLog({
    req,
    userId: admin.id,
    action: "create",
    entityType: "search_profile",
    entityId: profile.id,
    meta: { name: profile.name, country: profile.country, language: profile.language },
  });
  return created(profile);
});
