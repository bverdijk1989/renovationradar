/**
 * Integration-test database helpers.
 *
 * Activates only when TEST_DATABASE_URL is set. Use `describeIntegration`
 * instead of `describe` for any suite that needs a real Postgres+PostGIS.
 *
 * Workflow per test run:
 *   1. Apply Prisma migrations (`prisma migrate deploy`) against TEST_DATABASE_URL
 *   2. Apply prisma/sql/postgis_setup.sql (triggers, GiST, trigram)
 *   3. `resetDatabase()` between tests truncates all application tables
 *
 * Setup is idempotent — running the suite repeatedly is safe.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe } from "vitest";

const TEST_DB_ENV = "TEST_DATABASE_URL";
const TEST_DATABASE_URL = process.env[TEST_DB_ENV];

/** True when integration tests can run. */
export const integrationEnabled = Boolean(TEST_DATABASE_URL);

let prisma: PrismaClient | null = null;

/** Lazily-created Prisma client pointed at TEST_DATABASE_URL. */
export function getTestPrisma(): PrismaClient {
  if (!TEST_DATABASE_URL) {
    throw new Error(`${TEST_DB_ENV} is not set`);
  }
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: { db: { url: TEST_DATABASE_URL } },
    });
  }
  return prisma;
}

/** Truncate all application tables (preserves schema + extensions). */
export async function resetDatabase(): Promise<void> {
  const db = getTestPrisma();
  // Order: child tables before parents not strictly required with TRUNCATE
  // CASCADE, but we list explicitly to keep behavior predictable.
  await db.$executeRawUnsafe(`
    TRUNCATE TABLE
      audit_logs,
      saved_listings,
      alerts,
      review_queue,
      listing_features,
      listing_media,
      listing_embeddings,
      listing_scores,
      listing_locations,
      raw_listings,
      normalized_listings,
      deduplication_groups,
      crawl_jobs,
      source_reviews,
      sources,
      agencies,
      search_profiles,
      sessions,
      accounts,
      verification_tokens,
      users
    RESTART IDENTITY CASCADE;
  `);
}

/** Run migrations + postgis_setup once per test run. */
async function setupSchema(): Promise<void> {
  if (!TEST_DATABASE_URL) return;
  // Run `prisma migrate deploy` against the test DB. Inherits stdout so a
  // first-run user sees what's happening.
  execSync("pnpm prisma migrate deploy", {
    env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    stdio: "inherit",
  });

  // Apply PostGIS triggers + indexes (idempotent).
  const sqlPath = resolve(process.cwd(), "prisma/sql/postgis_setup.sql");
  const sql = readFileSync(sqlPath, "utf8");
  await getTestPrisma().$executeRawUnsafe(sql);
}

/**
 * `describe.skipIf(...)` wrapper. Use this for entire integration suites so
 * they no-op when TEST_DATABASE_URL is not set (CI without infra still passes).
 */
export const describeIntegration = integrationEnabled
  ? describe
  : describe.skip;

export function withIntegrationDb() {
  beforeAll(async () => {
    if (!integrationEnabled) return;
    await setupSchema();
  });
  beforeEach(async () => {
    if (!integrationEnabled) return;
    await resetDatabase();
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
      prisma = null;
    }
  });
}
