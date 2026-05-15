import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok } from "@/server/api/http";
import { requireAdmin } from "@/server/api/auth";
import { auditLog } from "@/server/api/audit";
import { DiscoveryRunSchema } from "@/server/schemas/discovery";
import {
  discoverAgencies,
  ManualImportProvider,
  SearchApiProvider,
} from "@/server/discovery";
import type { DiscoveryProvider } from "@/server/discovery";

/**
 * Admin-only entry point for the Discovery Engine.
 *
 * The engine NEVER auto-activates anything — it writes pending Source +
 * SourceReview rows. The admin then approves/rejects via the existing
 * /api/review/sources/:id/approve and /api/review/sources/:id/reject endpoints.
 */
export const POST = withApi(async (req: NextRequest) => {
  const admin = await requireAdmin(req);
  const body = DiscoveryRunSchema.parse(await req.json());

  const provider: DiscoveryProvider =
    body.provider === "search_api"
      ? new SearchApiProvider()
      : new ManualImportProvider();

  const result = await discoverAgencies({
    provider,
    country: body.country,
    language: body.language,
    region: body.region ?? null,
    providerInput: body.providerInput,
    actorUserId: admin.id,
  });

  await auditLog({
    req,
    userId: admin.id,
    action: "discovery_run",
    entityType: "source",
    entityId: null,
    meta: {
      country: body.country,
      language: body.language,
      region: body.region ?? null,
      provider: body.provider,
      queriesGenerated: result.queriesGenerated,
      candidatesPersisted: result.candidatesPersisted,
      candidatesSkipped: result.candidatesSkipped,
    },
  });

  return ok(result);
});
