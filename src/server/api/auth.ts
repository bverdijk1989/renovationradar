import "server-only";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import type { User } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ForbiddenError, UnauthorizedError } from "./http";

/**
 * Auth shim for fase 2/3.
 *
 * Until NextAuth.js is wired (fase 3+) we accept either:
 *   - the `X-Dev-User-Id` header (used by tests + API clients)
 *   - the `dev-user-id` cookie (set by /login, used by Server Components)
 *
 * Migration path to real sessions: replace this module's body with a call
 * to `getServerSession()` from NextAuth.
 *
 * In production builds (NODE_ENV=production) BOTH the header and cookie are
 * rejected unless DEV_AUTH_BYPASS=allow is set, to prevent accidental open prod.
 */

const DEV_HEADER = "x-dev-user-id";
export const DEV_COOKIE = "dev-user-id";

export type Actor = { user: User } | { user: null };

function isAllowed(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DEV_AUTH_BYPASS === "allow";
}

async function userFromId(id: string | null | undefined): Promise<User | null> {
  if (!id) return null;
  return prisma.user.findUnique({ where: { id } });
}

/**
 * Actor for an API route: reads from header first (tests/clients), then cookie.
 */
export async function getActor(req: NextRequest): Promise<Actor> {
  if (!isAllowed()) return { user: null };
  const headerValue = req.headers.get(DEV_HEADER);
  const cookieValue = req.cookies.get(DEV_COOKIE)?.value;
  const user = await userFromId(headerValue ?? cookieValue);
  return user ? { user } : { user: null };
}

/**
 * Server-Component variant: reads only from cookies (no NextRequest available
 * in RSC). Use this for app route page.tsx + layout.tsx files.
 */
export async function getCurrentUser(): Promise<User | null> {
  if (!isAllowed()) return null;
  const id = cookies().get(DEV_COOKIE)?.value;
  return userFromId(id);
}

export async function requireUser(req: NextRequest): Promise<User> {
  const actor = await getActor(req);
  if (!actor.user) throw new UnauthorizedError();
  return actor.user;
}

export async function requireAdmin(req: NextRequest): Promise<User> {
  const user = await requireUser(req);
  if (user.role !== "admin") throw new ForbiddenError("Admin role required");
  return user;
}
