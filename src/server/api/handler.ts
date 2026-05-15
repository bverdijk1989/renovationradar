import "server-only";
import type { NextRequest, NextResponse } from "next/server";
import { errorResponse } from "./http";

/**
 * Wraps a route handler so that all thrown errors (Zod, HttpError, Prisma,
 * unknown) are translated into a structured JSON response with the correct
 * HTTP status. Route handlers therefore never have to write try/catch.
 *
 * Usage in App Router:
 *
 *   export const GET = withApi(async (req, ctx) => {
 *     const filters = ListingFilterSchema.parse(...);
 *     return ok(await listListings(filters));
 *   });
 */
export type RouteContext<Params = Record<string, string>> = {
  params: Promise<Params>;
};

export function withApi<Params = Record<string, string>>(
  handler: (
    req: NextRequest,
    ctx: RouteContext<Params>,
  ) => Promise<NextResponse> | NextResponse,
) {
  return async (req: NextRequest, ctx: RouteContext<Params>) => {
    try {
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
