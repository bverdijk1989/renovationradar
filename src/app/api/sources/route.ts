import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { created, ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import {
  SourceCreateSchema,
  SourceListQuerySchema,
} from "@/server/schemas/sources";
import { createSource, listSources } from "@/server/services/sources";

export const GET = withApi(async (req: NextRequest) => {
  const q = SourceListQuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams));
  return ok(await listSources(q));
});

export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = SourceCreateSchema.parse(await req.json());
  const source = await createSource(body);
  await auditLog({
    req,
    userId: admin.id,
    action: "create",
    entityType: "source",
    entityId: source.id,
    meta: { name: source.name, country: source.country },
  });
  return created(source);
});
