import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok, ForbiddenError, UnauthorizedError } from "@/server/api/http";
import { normalizePending } from "@/server/services/normalization";

export const dynamic = "force-dynamic";

/**
 * Cron / admin endpoint: pak een batch nog-niet-verwerkte raw_listings en
 * normaliseer ze. Bedoeld om direct na een crawl-run te draaien zodat de
 * dashboard listings ziet.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_TOKEN" \
 *        http://localhost:3017/api/normalize/run-pending
 *
 * Optionele query parameter: ?limit=N (default 200, max 2000).
 */
export const POST = withApi(async (req: NextRequest) => {
  const expected = process.env.CRON_TOKEN;
  if (!expected || expected.length < 16) {
    throw new ForbiddenError("CRON_TOKEN not configured on server");
  }
  const header = req.headers.get("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  const provided = match?.[1] ?? "";
  if (!timingSafeEqual(provided, expected)) {
    throw new UnauthorizedError("Invalid or missing cron token");
  }

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = Math.max(
    1,
    Math.min(2000, Number.parseInt(limitParam ?? "200", 10) || 200),
  );

  const result = await normalizePending(limit);
  return ok(result);
});

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
