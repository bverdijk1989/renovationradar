import type { NextRequest } from "next/server";
import { withApi } from "@/server/api/handler";
import { ok, ForbiddenError, UnauthorizedError } from "@/server/api/http";
import { runAllActiveSources } from "@/server/services/jobs";

export const dynamic = "force-dynamic";

/**
 * Cron-getriggerd endpoint dat één CrawlJob per actieve+groene bron
 * aanmaakt en uitvoert. Bedoeld voor de systemd timer; admin-cookie/header
 * niet vereist. In plaats daarvan: een gedeeld geheim via env-var.
 *
 *   curl -X POST -H "Authorization: Bearer $CRON_TOKEN" \
 *        http://localhost:3017/api/jobs/run-all
 *
 * `CRON_TOKEN` moet in de .env staan (mode 600). Als het env-var niet
 * geset is geeft het endpoint 403 — dat voorkomt dat de cron per ongeluk
 * publiek bereikbaar is.
 *
 * Constant-time vergelijking om timing-attacks op de token uit te sluiten.
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
  const result = await runAllActiveSources();
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
