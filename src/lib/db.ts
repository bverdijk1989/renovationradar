import { PrismaClient } from "@prisma/client";

/**
 * Prisma singleton.
 *
 * Next.js with hot-reload in dev would otherwise create a new PrismaClient
 * on every module reload, exhausting Postgres connections. We attach to
 * `globalThis` in dev, but use a fresh client in production.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
