/**
 * Applies prisma/sql/postgis_setup.sql against $DATABASE_URL.
 *
 * Idempotent. Run after `prisma migrate deploy` (or `prisma migrate dev`).
 *
 * Why not put this in a Prisma migration? See the header of
 * `prisma/sql/postgis_setup.sql`.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PrismaClient } from "@prisma/client";

async function main() {
  const sqlPath = resolve(process.cwd(), "prisma/sql/postgis_setup.sql");
  const sql = readFileSync(sqlPath, "utf8");

  const prisma = new PrismaClient();
  try {
    // $executeRawUnsafe handles multi-statement SQL files. Safe here because
    // we control the input (it's a checked-in file, not user input).
    await prisma.$executeRawUnsafe(sql);
    // eslint-disable-next-line no-console
    console.log("[postgis] applied successfully");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[postgis] failed:", err);
  process.exit(1);
});
